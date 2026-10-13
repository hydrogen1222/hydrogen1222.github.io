#!/usr/bin/env python3
# =============================================================================
# gen_conv_test.py —— CP2K 预检:CUTOFF 收敛测试 + k 点收敛测试
#
# 正式批量算之前,在【一个代表性结构】上跑这些单点(ENERGY_FORCE,开解析应力),
# 看 总能 / 应力 / 最大力 到哪个 CUTOFF、哪个 k 网格不再变,据此定参数。
#
# 用法:
#   python3 gen_conv_test.py gen   structure.cif      # 生成测试输入(两组)
#   (把生成的每个目录用 cp2k 跑出 cp2k.out,例如在每个目录里 cp2k.psmp -i conv.inp -o cp2k.out)
#   python3 gen_conv_test.py parse conv_cutoff        # 跑完后,汇总 cutoff 扫描结果
#   python3 gen_conv_test.py parse conv_kmesh         # 汇总 k 点扫描结果
# 依赖:pip install pymatgen
# =============================================================================
import sys, os, glob, math
from pymatgen.core import Structure

# ===================== 配置(和你正式计算保持一致!) =====================
CUTOFF_LIST       = [300, 400, 500, 600, 700, 800]   # cutoff 扫描值
REL_CUTOFF        = 60
KMESH_FOR_CUTSCAN = "3 3 3"                            # cutoff 扫描时固定的 k 网格
KMESH_LIST        = ["1 1 1","2 2 2","3 3 3","4 4 4","5 5 5"]  # k 点扫描
CUTOFF_FOR_KSCAN  = 600                                # k 点扫描时固定的 cutoff
BASIS_FILE = "BASIS_MOLOPT_UZH"
BASIS_TPL  = "DZVP-MOLOPT-PBE-GTH-q{q}"
POT_FILE   = "GTH_POTENTIALS"
POT_TPL    = "GTH-PBE-q{q}"
QMAP = {"H":1,"Li":3,"Be":4,"B":3,"C":4,"N":5,"O":6,"F":7,"Na":9,"Mg":10,
        "Al":3,"Si":4,"P":5,"S":6,"Cl":7,"K":9,"Ca":10,"Br":7,"I":7,"Ge":4}
HARTREE2MEV = 27211.386
# =======================================================================

TEMPLATE = """&GLOBAL
  PROJECT conv
  RUN_TYPE ENERGY_FORCE
  PRINT_LEVEL LOW
  EXTENDED_FFT_LENGTHS .TRUE.
&END GLOBAL
&FORCE_EVAL
  METHOD QS
  STRESS_TENSOR ANALYTICAL
  &DFT
    BASIS_SET_FILE_NAME {basisfile}
    POTENTIAL_FILE_NAME {potfile}
    &KPOINTS
      SCHEME MONKHORST-PACK {kmesh}
      SYMMETRY OFF
    &END KPOINTS
    &MGRID
      CUTOFF {cutoff}
      REL_CUTOFF {relcut}
    &END MGRID
    &QS
      METHOD GPW
      EPS_DEFAULT 1.0E-12
      EXTRAPOLATION USE_GUESS
    &END QS
    &SCF
      SCF_GUESS ATOMIC
      EPS_SCF 1.0E-7
      MAX_SCF 100
      ADDED_MOS 20
      &SMEAR ON
        METHOD FERMI_DIRAC
        ELECTRONIC_TEMPERATURE [K] 300
      &END SMEAR
      &DIAGONALIZATION ON
        ALGORITHM STANDARD
      &END DIAGONALIZATION
      &MIXING
        METHOD BROYDEN_MIXING
        ALPHA 0.4
        NBROYDEN 8
      &END MIXING
    &END SCF
    &XC
      &XC_FUNCTIONAL PBE
      &END XC_FUNCTIONAL
    &END XC
  &END DFT
  &SUBSYS
    &CELL
{cell}
    &END CELL
    &COORD
{coord}
    &END COORD
{kinds}
  &END SUBSYS
&END FORCE_EVAL
"""

def fmt_cell(m):
    return "\n".join(f"      {l}   {v[0]:>18.10f} {v[1]:>18.10f} {v[2]:>18.10f}"
                     for l, v in zip("ABC", m))
def fmt_coord(sym, pos):
    return "\n".join(f"      {s:<3} {p[0]:>18.10f} {p[1]:>18.10f} {p[2]:>18.10f}"
                     for s, p in zip(sym, pos))
def make_kinds(symbols):
    out = []
    for el in dict.fromkeys(symbols):
        q = QMAP.get(el, "?")
        out.append(f"    &KIND {el}\n      ELEMENT {el}\n"
                   f"      BASIS_SET {BASIS_TPL.format(q=q)}\n"
                   f"      POTENTIAL {POT_TPL.format(q=q)}\n    &END KIND")
    return "\n".join(out)

def write_inp(path, st, cutoff, kmesh):
    text = TEMPLATE.format(basisfile=BASIS_FILE, potfile=POT_FILE, kmesh=kmesh,
        cutoff=cutoff, relcut=REL_CUTOFF, cell=fmt_cell(st.lattice.matrix),
        coord=fmt_coord([str(s) for s in st.species], st.cart_coords),
        kinds=make_kinds([str(s) for s in st.species]))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f: f.write(text)

def do_gen(cif):
    st = Structure.from_file(cif)
    print(f"代表结构: {cif}  ({len(st)} 原子, 体积 {st.lattice.volume:.1f} Å³)")
    for c in CUTOFF_LIST:
        write_inp(f"conv_cutoff/cut_{c}/conv.inp", st, c, KMESH_FOR_CUTSCAN)
    print(f"[cutoff 扫描] conv_cutoff/cut_*/  共 {len(CUTOFF_LIST)} 个 (k 固定 {KMESH_FOR_CUTSCAN})")
    for k in KMESH_LIST:
        write_inp(f"conv_kmesh/k_{k.replace(' ','')}/conv.inp", st, CUTOFF_FOR_KSCAN, k)
    print(f"[k 点扫描] conv_kmesh/k_*/  共 {len(KMESH_LIST)} 个 (cutoff 固定 {CUTOFF_FOR_KSCAN})")
    print("\n下一步:进每个子目录跑 cp2k 得到 cp2k.out,例如:")
    print("  for d in conv_cutoff/cut_* conv_kmesh/k_*; do (cd $d && cp2k.psmp -i conv.inp -o cp2k.out); done")
    print("跑完用:  python3 gen_conv_test.py parse conv_cutoff   /   parse conv_kmesh")

def read_out(out):
    """取 总能(Ha)、应力 1/3 迹、最大原子力(a.u.)。"""
    e = trace = None; maxf = 0.0; inforce = False; natom = 0
    for ln in open(out):
        if "ENERGY| Total FORCE_EVAL" in ln:
            try: e = float(ln.split()[-1])
            except ValueError: pass
        elif "STRESS| 1/3 Trace" in ln:
            try: trace = float(ln.split()[-1])
            except ValueError: pass
        elif "ATOMIC FORCES in" in ln:
            inforce = True; maxf = 0.0
        elif inforce:
            if ln.strip().upper().startswith("SUM OF ATOMIC FORCES"):
                inforce = False
            else:
                t = ln.split()
                if len(t) >= 6:
                    try:
                        fx, fy, fz = float(t[-3]), float(t[-2]), float(t[-1])
                        maxf = max(maxf, math.sqrt(fx*fx+fy*fy+fz*fz)); natom += 1
                    except ValueError: pass
    return e, trace, (maxf if natom else None)

def do_parse(root):
    dirs = sorted(glob.glob(os.path.join(root, "*")))
    rows = []
    for d in dirs:
        outs = glob.glob(os.path.join(d, "cp2k.out")) + glob.glob(os.path.join(d, "*.out"))
        if not outs: continue
        e, tr, mf = read_out(sorted(outs)[0])
        rows.append((os.path.basename(d), e, tr, mf))
    if not rows:
        print(f"{root}/*/ 下没找到 cp2k 输出(*.out)。先把测试跑完。"); return
    # 以最后一个(最大 cutoff / 最密 k)为参考算 ΔE
    ref_e = rows[-1][1]
    print(f"\n{'参数':<12}{'总能(Ha)':>18}{'ΔE vs最密(meV/atom?)':>22}{'应力1/3迹':>14}{'最大力(a.u.)':>14}")
    print("-"*82)
    for name, e, tr, mf in rows:
        # 注:ΔE 这里按"每个结构总能差"显示;要 per-atom 请除以原子数(同一结构原子数相同)
        de = "" if (e is None or ref_e is None) else f"{(e-ref_e)*HARTREE2MEV:.2f}"
        print(f"{name:<12}{('' if e is None else f'{e:.8f}'):>18}{de:>22}"
              f"{('' if tr is None else f'{tr:.4f}'):>14}{('' if mf is None else f'{mf:.5f}'):>14}")
    print("-"*82)
    print("看 ΔE、应力1/3迹、最大力 从哪一行起基本不再变,就取那个参数(应力通常最晚收敛)。")
    print("ΔE 列是相对最密那次的'总能差';同一结构原子数相同,除以原子数即 meV/atom。")

def main():
    if len(sys.argv) < 3:
        print("用法: gen_conv_test.py gen <结构.cif>  |  parse <conv_cutoff|conv_kmesh>"); return
    mode = sys.argv[1]
    if mode == "gen":   do_gen(sys.argv[2])
    elif mode == "parse": do_parse(sys.argv[2])
    else: print("mode 只能是 gen 或 parse")

if __name__ == "__main__":
    main()
