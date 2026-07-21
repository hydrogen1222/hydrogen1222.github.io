#!/usr/bin/env python3
# =============================================================================
# gen_cp2k_inputs.py  (自给自足版) —— 批量生成"生产级"CP2K 变胞优化输入
#
# 和上一版的区别:不再依赖某个已有的 1.inp,而是内置一整套推荐设置
# (你确认过的 DZVP-MOLOPT-PBE-GTH-qN 基组 + GTH-PBE-qN 赝势 + 600 Ry +
#  k 点 + STRESS_TENSOR ANALYTICAL + 涂抹/对角化 + EXTRAPOLATION + 两步 MOTION),
# 只把每个文件夹的几何塞进去。适合"推倒重来、从原始 cif 干净开跑"。
#
# 几何来源(每个子文件夹自动找,优先级见 GEOM_GLOB):
#   - *.restart   续算时用(最接近收敛的几何)
#   - *.cif       全新开跑时用(你的原始 6.97 Å 原胞)
#   - Multiwfn 生成的骨架 *.inp 也能直接读(把 GEOM_GLOB 设成它的文件名)
#
# 用法:  python3 gen_cp2k_inputs.py            # 当前目录所有子文件夹
#        python3 gen_cp2k_inputs.py /path/to/root
# 依赖:pip install ase pymatgen
# =============================================================================
import sys, os, glob, re

# ===================== 配置(按需修改) =====================
OUT_INP    = "cell_opt.inp"   # 生成的输入文件名
RUN_TYPE   = "CELL_OPT"       # 第一步可先 GEO_OPT,再改 CELL_OPT 生成第二份
CUTOFF     = 600              # Ry —— 你测出来应力到 600 才收敛
REL_CUTOFF = 60
EPS_SCF    = "1.0E-7"
EPS_DEF    = "1.0E-12"
PRESS_TOL  = 500              # bar
MAX_ITER   = 500
KMESH      = "5 4 4"          # ← 用你 k 点收敛测试 / 对齐 VASP 后定的网格!这是占位
KSYMMETRY  = False

# --- 基组/赝势:二选一,48 个全程别混。基组名/文件/q 必须配套 ---
# 方案①(你之前用的,PBE 专用 MOLOPT):
BASIS_FILE = "BASIS_MOLOPT_UZH"
BASIS_TPL  = "DZVP-MOLOPT-PBE-GTH-q{q}"
# 方案②(Multiwfn 默认那套 SR,致密固体常用)——要用就把上面两行注释掉、解开下面两行:
# BASIS_FILE = "BASIS_MOLOPT"
# BASIS_TPL  = "DZVP-MOLOPT-SR-GTH-q{q}"
POT_FILE   = "GTH_POTENTIALS"
POT_TPL    = "GTH-PBE-q{q}"
# 各元素价电子数 q(GTH-PBE 标准;按需核对/增补)
QMAP = {"H":1,"Li":3,"Be":4,"B":3,"C":4,"N":5,"O":6,"F":7,"Na":9,"Mg":10,
        "Al":3,"Si":4,"P":5,"S":6,"Cl":7,"K":9,"Ca":10,"Br":7,"I":7}

# 推倒重来:True=只用原始 cif 几何(忽略残留的旧 restart);False=优先 restart 续算
START_OVER = True
# 每个文件夹找几何的优先顺序(glob)。想用 Multiwfn 骨架就把它的文件名放最前
GEOM_GLOB  = (["structure.cif", "*.cif"] if START_OVER
              else ["*.restart", "structure.cif", "*.cif"])
# ==========================================================

ELEMENTS = set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr "
    "Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In "
    "Sn Sb Te I Xe Cs Ba La").split())

TEMPLATE = """&GLOBAL
  PROJECT {proj}
  RUN_TYPE {runtype}
  PRINT_LEVEL LOW
  EXTENDED_FFT_LENGTHS .TRUE.
&END GLOBAL
&MOTION
  &GEO_OPT
    OPTIMIZER BFGS
    MAX_ITER {maxiter}
    MAX_FORCE 4.5E-4
    RMS_FORCE 3.0E-4
    MAX_DR 3.0E-3
    RMS_DR 1.5E-3
  &END GEO_OPT
  &CELL_OPT
    OPTIMIZER BFGS
    MAX_ITER {maxiter}
    MAX_FORCE 4.5E-4
    RMS_FORCE 3.0E-4
    MAX_DR 3.0E-3
    RMS_DR 1.5E-3
    PRESSURE_TOLERANCE {presstol}
    KEEP_ANGLES .FALSE.
  &END CELL_OPT
&END MOTION
&FORCE_EVAL
  METHOD QS
  STRESS_TENSOR ANALYTICAL
  &DFT
    BASIS_SET_FILE_NAME {basisfile}
    POTENTIAL_FILE_NAME {potfile}
    &KPOINTS
      SCHEME MONKHORST-PACK {kmesh}{symline}
    &END KPOINTS
    &MGRID
      CUTOFF {cutoff}
      REL_CUTOFF {relcut}
    &END MGRID
    &QS
      METHOD GPW
      EPS_DEFAULT {epsdef}
      EXTRAPOLATION USE_GUESS
    &END QS
    &SCF
      SCF_GUESS ATOMIC
      EPS_SCF {epsscf}
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

def parse_cp2k_geom(path):
    """从 CP2K 格式文本(.restart 或 Multiwfn 骨架 .inp)抠 &CELL 矢量 + &COORD。"""
    from pymatgen.core import Lattice, Structure
    cv = {}; inc = inco = False; co = []; scaled = False
    for ln in open(path):
        s = ln.strip(); u = s.upper()
        if u.startswith("&END CELL"):  inc = False; continue
        if u.startswith("&END COORD"): inco = False; continue
        if u.startswith("&CELL") and not u.startswith("&CELL_"): inc = True; continue
        if u.startswith("&COORD"):     inco = True; continue
        if inc:
            t = s.split()
            if t and t[0].upper() in ("A","B","C") and t[0].upper() not in cv and len(t) >= 4:
                cv[t[0].upper()] = [float(t[1]), float(t[2]), float(t[3])]
        elif inco:
            t = s.split()
            if t and t[0].upper() == "SCALED" and len(t) >= 2:
                scaled = t[1].upper() in ("T","TRUE",".TRUE.")
            elif len(t) >= 4 and t[0] in ELEMENTS:
                co.append((t[0], float(t[1]), float(t[2]), float(t[3])))
    if not ({"A","B","C"} <= set(cv)): raise ValueError("没解析到 A/B/C 晶胞矢量")
    if not co: raise ValueError("没解析到坐标")
    return Structure(Lattice([cv["A"],cv["B"],cv["C"]]),
                     [c[0] for c in co], [[c[1],c[2],c[3]] for c in co],
                     coords_are_cartesian=not scaled)

def get_geometry(folder):
    """返回 (3x3晶胞, 元素list, 笛卡尔坐标, 来源)。按 GEOM_GLOB 顺序找。"""
    for pat in GEOM_GLOB:
        files = sorted(glob.glob(os.path.join(folder, pat)))
        if not files: continue
        f = files[0]; low = f.lower()
        if low.endswith(".cif"):
            from pymatgen.core import Structure
            st = Structure.from_file(f)
            st.remove_oxidation_states()   # 去掉 cif 里的氧化态(Li+/S2- -> Li/S),否则 ELEMENT 和 q 会错
            return st.lattice.matrix, [str(s) for s in st.species], st.cart_coords, os.path.basename(f)
        if low.endswith(".restart"):
            try:
                import ase.io
                a = ase.io.read(f, format="cp2k-restart")
                return a.cell[:], a.get_chemical_symbols(), a.get_positions(), os.path.basename(f)
            except Exception:
                st = parse_cp2k_geom(f)
                return st.lattice.matrix, [str(s) for s in st.species], st.cart_coords, os.path.basename(f)+"(手动)"
        # 其它(Multiwfn 骨架 .inp 等)按 CP2K 文本解析
        st = parse_cp2k_geom(f)
        return st.lattice.matrix, [str(s) for s in st.species], st.cart_coords, os.path.basename(f)
    return None

def fmt_cell(cell):
    return "\n".join(f"      {lab}   {v[0]:>18.10f} {v[1]:>18.10f} {v[2]:>18.10f}"
                     for lab, v in zip("ABC", cell))

def fmt_coord(sym, pos):
    return "\n".join(f"      {s:<3} {p[0]:>18.10f} {p[1]:>18.10f} {p[2]:>18.10f}"
                     for s, p in zip(sym, pos))

def make_kinds(symbols):
    out, unknown = [], []
    for el in dict.fromkeys(symbols):   # 去重保序
        q = QMAP.get(el)
        if q is None: unknown.append(el); q = "?"
        out.append(f"    &KIND {el}\n      ELEMENT {el}\n"
                   f"      BASIS_SET {BASIS_TPL.format(q=q)}\n"
                   f"      POTENTIAL {POT_TPL.format(q=q)}\n    &END KIND")
    return "\n".join(out), unknown

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    folders = sorted(d for d in glob.glob(os.path.join(root, "*")) if os.path.isdir(d))
    symline = ("\n      SYMMETRY ON" if KSYMMETRY else "")
    ok = fail = 0; warned = set()
    for folder in folders:
        name = os.path.basename(folder)
        try:
            geo = get_geometry(folder)
            if geo is None: raise ValueError("没找到几何(restart/cif/inp 都没有)")
            cell, sym, pos, srcinfo = geo
            kinds, unknown = make_kinds(sym)
            for u in unknown:
                if u not in warned:
                    print(f"  ⚠ 元素 {u} 不在 QMAP 里,&KIND 写成了 q?,请手动补 q 值"); warned.add(u)
            text = TEMPLATE.format(
                proj=name, runtype=RUN_TYPE, maxiter=MAX_ITER, presstol=PRESS_TOL,
                basisfile=BASIS_FILE, potfile=POT_FILE, kmesh=KMESH, symline=symline,
                cutoff=CUTOFF, relcut=REL_CUTOFF, epsdef=EPS_DEF, epsscf=EPS_SCF,
                cell=fmt_cell(cell), coord=fmt_coord(sym, pos), kinds=kinds)
            with open(os.path.join(folder, OUT_INP), "w") as fo:
                fo.write(text)
            print(f"[OK] {name}: {OUT_INP}  几何<-{srcinfo}  ({len(sym)}原子)")
            ok += 1
        except Exception as e:
            print(f"[FAIL] {name}: {type(e).__name__}: {e}"); fail += 1
    print(f"\n生成 {ok},失败 {fail}。RUN_TYPE={RUN_TYPE} CUTOFF={CUTOFF} KMESH='{KMESH}'")
    print(f"★ 跑前抽查一个 {OUT_INP}:KMESH 是否是你测过的、&KIND 的 q 值对不对。")

if __name__ == "__main__":
    main()
