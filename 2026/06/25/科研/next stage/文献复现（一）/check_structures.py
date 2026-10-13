#!/usr/bin/env python3
# =============================================================================
# check_structures.py  (自给自足 + 灵活版) —— 批量体检优化后的结构 + 排能量
#
# 相比旧版的改进:
#   1) 自动从一堆 restart 里挑【主 restart】(不带 _数字 后缀的那个 = 最终几何),
#      不用先转 cif、也不用自己排序;
#   2) 直接读 restart 拿终态几何(ASE 失败则手动解析兜底);
#   3) 自动找 CP2K 输出(不管它叫 cell_opt.out 还是别的),取末能量 + 收敛状态;
#      未收敛的会标出来,提醒你它的能量/结构不可信;
#   4) 体检(最近间距/体积/密度离群/原子数) + 按 meV/atom 排序 + StructureMatcher 去重。
#   5) 输出 a_eq = (4*V)^(1/3), 能量精细列: E(Ha) 12位, ΔE meV/atom 4位, ΔE meV/f.u. 3位
#
# 用法:  python3 check_structures.py [根目录]
# 依赖:pip install ase pymatgen
# =============================================================================
import sys, os, glob, re, math
from statistics import median

ROOT          = sys.argv[1] if len(sys.argv) > 1 else "."
MIN_DIST_FLAG = 1.2          # Å,最近原子间距小于此 = 重叠
VOL_DEV_FLAG  = 0.10         # 体积/密度偏离中位数比例阈值
HARTREE2MEV   = 27211.386245988

ELEMENTS = set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr "
    "Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In "
    "Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W "
    "Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn").split())

def latest_restart(folder):
    """挑主 restart:排除 *_<N>.restart 历史快照(.bak 本就不以 .restart 结尾)。"""
    cands = glob.glob(os.path.join(folder, "*.restart"))
    main = [f for f in cands if not re.search(r'_\d+\.restart$', os.path.basename(f))]
    pool = main if main else cands
    return max(pool, key=os.path.getmtime) if pool else None

def parse_cp2k_geom(path):
    from pymatgen.core import Lattice, Structure
    cv = {}; inc = inco = False; co = []; scaled = False
    for ln in open(path, errors="ignore"):
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
    if not ({"A","B","C"} <= set(cv)): raise ValueError("restart 没解析到 A/B/C 晶胞")
    if not co: raise ValueError("restart 没解析到坐标")
    return Structure(Lattice([cv["A"],cv["B"],cv["C"]]),
                     [c[0] for c in co], [[c[1],c[2],c[3]] for c in co],
                     coords_are_cartesian=not scaled)

def read_geom(folder):
    """终态几何来源优先级:主 restart > optimized.cif。绝不读原始 cif(那是未优化的)。"""
    rs = latest_restart(folder)
    if rs:
        try:
            import ase.io
            from pymatgen.core import Lattice, Structure
            a = ase.io.read(rs, format="cp2k-restart")
            st = Structure(Lattice(a.cell[:]), a.get_chemical_symbols(),
                           a.get_positions(), coords_are_cartesian=True)
            return st, os.path.basename(rs)
        except Exception:
            return parse_cp2k_geom(rs), os.path.basename(rs) + "(手动)"
    opt = os.path.join(folder, "optimized.cif")
    if os.path.exists(opt):
        from pymatgen.core import Structure
        st = Structure.from_file(opt); st.remove_oxidation_states()
        return st, "optimized.cif"
    return None, None

def find_output(folder):
    """自动找 CP2K 输出(含 'Total FORCE_EVAL' 的 .out/.log,排除 slurm-*),
       返回 (文件名, 末能量Ha, 是否几何收敛)。"""
    cands = [f for f in glob.glob(os.path.join(folder, "*.out")) +
                       glob.glob(os.path.join(folder, "*.log"))
             if not os.path.basename(f).lower().startswith("slurm")]
    for f in sorted(cands, key=os.path.getmtime, reverse=True):
        e = None; completed = False; iscp2k = False
        for ln in open(f, errors="ignore"):
            if "Total FORCE_EVAL" in ln:
                iscp2k = True
                try: e = float(ln.split()[-1])
                except ValueError: pass
            elif "GEOMETRY OPTIMIZATION COMPLETED" in ln:
                completed = True
        if iscp2k:
            return os.path.basename(f), e, completed
    return None, None, None

# ---------- 收集 ----------
folders = sorted(d for d in glob.glob(os.path.join(ROOT, "*")) if os.path.isdir(d))
rows, structs = [], {}
for folder in folders:
    name = os.path.basename(folder)
    st, gsrc = read_geom(folder)
    if st is None:
        print(f"[跳过] {name}: 没有 restart 也没有 optimized.cif")
        continue
    structs[name] = st
    dm = st.distance_matrix; n = len(st)
    mind, pair = 1e9, ("", "")
    for i in range(n):
        for j in range(i+1, n):
            if dm[i][j] < mind:
                mind = dm[i][j]; pair = (st[i].species_string, st[j].species_string)
    outname, E, conv = find_output(folder)
    rows.append({"name": name, "n": n, "gsrc": gsrc, "outname": outname,
                 "a": st.lattice.abc[0], "b": st.lattice.abc[1], "c": st.lattice.abc[2],
                 "vol": st.lattice.volume, "rho": float(st.density),
                 "mind": mind, "pair": pair, "E": E, "conv": conv,
                 "a_eq": (4 * st.lattice.volume) ** (1/3)})   # 新增

if not rows:
    print(f"没找到任何可读的结构(在 {os.path.abspath(ROOT)}/*/)。"); sys.exit(0)

vol_med = median(r["vol"] for r in rows)
rho_med = median(r["rho"] for r in rows)
n_set   = set(r["n"] for r in rows)
energies = [r["E"] for r in rows if r["E"] is not None]
e_min = min(energies) if energies else None

for r in rows:
    flags = []
    if r["mind"] < MIN_DIST_FLAG:
        flags.append(f"原子重叠({r['pair'][0]}-{r['pair'][1]} {r['mind']:.2f}Å)")
    if abs(r["vol"]-vol_med)/vol_med > VOL_DEV_FLAG: flags.append("体积离群")
    if abs(r["rho"]-rho_med)/rho_med > VOL_DEV_FLAG: flags.append("密度离群")
    if r["conv"] is False: flags.append("未收敛!")
    if r["conv"] is None and r["outname"] is None: flags.append("没找到输出")
    r["flags"] = flags

    # 精细能量计算
    if r["E"] is not None and e_min is not None:
        r["dE_meV_atom"] = (r["E"] - e_min) * HARTREE2MEV / r["n"]
        r["dE_meV_fu"] = r["dE_meV_atom"] * 13
    else:
        r["dE_meV_atom"] = None
        r["dE_meV_fu"] = None
    r["dE"] = r["dE_meV_atom"]   # 兼容旧排序

# 排序:收敛优先,再按相对能量
rows.sort(key=lambda r: (r["conv"] is not True, r["dE"] is None,
                         r["dE"] if r["dE"] is not None else 0))

print(f"\n根目录: {os.path.abspath(ROOT)}")
print(f"结构数: {len(rows)}   体积中位数: {vol_med:.1f} Å³   密度中位数: {rho_med:.3f} g/cm³")
if len(n_set) > 1:
    print(f"⚠ 各结构原子数不一致 {sorted(n_set)} —— 总能不可直接比,已折算 meV/atom。")
print("-"*145)
print(f"{'文件夹':<22}{'原子':>4}{'收敛':>5}{'a':>8}{'b':>8}{'c':>8}{'a_eq':>8}"
      f"{'体积':>9}{'密度':>7}{'最近间距':>9}"
      f"{'E(Ha)':>20}{'ΔE(meV/at)':>14}{'ΔE(meV/f.u.)':>15}  备注")
print("-"*145)

for r in rows:
    cflag = "✓" if r["conv"] is True else ("✗" if r["conv"] is False else "?")
    E_str   = f"{r['E']:.12f}" if r['E'] is not None else " " * 20
    dE_atom = f"{r['dE_meV_atom']:.4f}" if r['dE_meV_atom'] is not None else " " * 14
    dE_fu   = f"{r['dE_meV_fu']:.3f}" if r['dE_meV_fu'] is not None else " " * 15
    note = "; ".join(r["flags"]) if r["flags"] else "✓"
    print(f"{r['name']:<22}{r['n']:>4}{cflag:>5}"
          f"{r['a']:>8.3f}{r['b']:>8.3f}{r['c']:>8.3f}{r['a_eq']:>8.3f}"
          f"{r['vol']:>9.1f}{r['rho']:>7.3f}{r['mind']:>9.2f}"
          f"{E_str:>20}{dE_atom:>14}{dE_fu:>15}  {note}")
print("-"*145)

bad = [r["name"] for r in rows if r["flags"]]
if bad: print(f"需关注 {len(bad)} 个: " + ", ".join(bad))
else:   print("所有结构:已收敛、间距/体积/密度均正常。")

# ---- 去重 + 能量交叉验证 ----
LTOL, STOL, ANGLE_TOL = 0.2, 0.3, 5    # StructureMatcher 容差(默认偏松;要更严就调小,如 STOL=0.1)
GROUP_E_FLAG = 0.5                       # meV/atom,组内能量差超过此值 -> 该组"等价"判定存疑
try:
    from pymatgen.analysis.structure_matcher import StructureMatcher
    sm = StructureMatcher(ltol=LTOL, stol=STOL, angle_tol=ANGLE_TOL)
    items = list(structs.items())
    groups = sm.group_structures([s for _, s in items])
    name_by_id = {id(s): nm for nm, s in items}
    de_by_name = {r["name"]: r["dE"] for r in rows}
    print(f"\nStructureMatcher 去重(ltol={LTOL}, stol={STOL}, angle_tol={ANGLE_TOL}): "
          f"{len(items)} 个构型 -> {len(groups)} 种不等价结构")
    print("  (组内能量应几乎相同;相差大=把不等价的并一起了,以能量为准)")
    gsum = []
    for g in groups:
        names = [name_by_id.get(id(s), "?") for s in g]
        des = [de_by_name.get(n) for n in names if de_by_name.get(n) is not None]
        emin = min(des) if des else None
        spread = (max(des) - min(des)) if des else None
        gsum.append((emin if emin is not None else 1e9, names, emin, spread))
    gsum.sort(key=lambda x: x[0])
    suspicious = 0
    for gi, (_, names, emin, spread) in enumerate(gsum, 1):
        tag = ""
        if spread is not None and spread > GROUP_E_FLAG:
            tag = f"   ⚠ 组内能量差 {spread:.1f} meV/atom,等价判定存疑"; suspicious += 1
        er = (f"ΔE {emin:.1f}" + (f"~{emin+spread:.1f}" if spread else "") + " meV/at") if emin is not None else "无能量"
        print(f"  组{gi:>2} ({len(names):>2}个, {er}){tag}")
        print(f"        {', '.join(sorted(names))}")
    if suspicious:
        print(f"\n有 {suspicious} 个组能量差偏大 -> 建议把 STOL 调小(如 0.1)重跑,或对这些组以能量区分/手动核对。")
except Exception as ex:
    print(f"\n(去重跳过:{ex})")
