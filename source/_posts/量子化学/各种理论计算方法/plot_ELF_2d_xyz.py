#!/usr/bin/env python3
import argparse
import os
import shutil

import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib import font_manager


def setup_latex_rendering():
    """Render all $...$ math with LaTeX syntax.

    If a TeX distribution is available we use the real LaTeX backend,
    otherwise we fall back to matplotlib's mathtext, which still honours
    the same LaTeX math syntax.  The sans-serif family is preferred so the
    plot matches an Arial-like look.
    """
    # matplotlib's usetex path uses `latex` + `dvipng`; only enable it when
    # the needed executables are actually available, otherwise fall back to
    # mathtext (which still understands $...$ LaTeX math syntax).
    use_tex = bool(shutil.which("latex") and shutil.which("dvipng"))
    if use_tex:
        mpl.rcParams["text.usetex"] = True
        # helvet is the standard LaTeX substitute for Arial/Helvetica.
        mpl.rcParams["text.latex.preamble"] = (
            r"\usepackage{amsmath}"
            r"\usepackage{helvet}"
            r"\renewcommand{\familydefault}{\sfdefault}"
        )
    else:
        mpl.rcParams["text.usetex"] = False


def setup_fonts(preferred="Arial"):
    """Use Arial when it is installed, otherwise fall back to Helvetica/DejaVu.

    For the non-TeX mathtext path this also makes math symbols use the same
    sans-serif family, so the whole figure has a consistent Arial-like look.
    """
    available = {f.name for f in font_manager.fontManager.ttflist}
    candidates = [preferred, "Helvetica", "DejaVu Sans"]
    chosen = next((f for f in candidates if f in available), "DejaVu Sans")

    mpl.rcParams["font.family"] = "sans-serif"
    mpl.rcParams["font.sans-serif"] = [chosen] + [
        f for f in candidates if f != chosen
    ]

    # Used when real LaTeX is not available; matplotlib's mathtext still
    # understands $...$ LaTeX syntax.
    mpl.rcParams["mathtext.fontset"] = "custom"
    mpl.rcParams["mathtext.rm"] = chosen
    mpl.rcParams["mathtext.it"] = f"{chosen}:italic"
    mpl.rcParams["mathtext.bf"] = f"{chosen}:bold"
    mpl.rcParams["mathtext.sf"] = chosen
    mpl.rcParams["mathtext.tt"] = chosen
    mpl.rcParams["mathtext.cal"] = chosen


def molecule_center(u, v, val):
    """Estimate the centre of the molecule.

    Use the ELF-weighted centroid (centre of mass of the electron
    localisation) of the points whose ELF exceeds half the maximum.
    This is a robust generic proxy for the middle of the molecule that
    works even when the sampling plane is larger than the molecule.
    """
    mask = val >= 0.5 * val.max()
    if not mask.any():
        mask = np.ones_like(val, dtype=bool)
    w = val[mask]
    cu = np.average(u[mask], weights=w)
    cv = np.average(v[mask], weights=w)
    return cu, cv


def align_colorbar_with_axes(ax, cbar):
    """Give the colorbar the exact same vertical extent as the plot axes.

    With an equal-aspect axes, ``tight_layout`` / ``constrained_layout``
    keep the colorbar taller than the plot image; this forces the right
    hand scale to line up exactly with the picture.
    """
    fig = ax.get_figure()
    fig.canvas.draw()
    pos = ax.get_position()
    cpos = cbar.ax.get_position()
    cbar.ax.set_position([cpos.x0, pos.y0, cpos.width, pos.height])


def contour_label_positions(cs, cu, cv):
    """Return one label position per contour level, spread around the centre.

    Instead of letting ``clabel`` put many labels on every long contour,
    choose a single point per level.  The target angles are evenly spaced so
    the few remaining labels do not pile up on top of each other.
    """
    positions = []
    n_levels = max(len(cs.levels), 1)
    for i, level_segs in enumerate(cs.allsegs):
        target_angle = 2.0 * np.pi * i / n_levels
        best = None
        best_key = (np.inf, np.inf)  # (angle difference, distance to centre)

        for seg in level_segs:
            seg = np.asarray(seg)
            if seg.ndim != 2 or len(seg) == 0:
                continue

            angles = np.arctan2(seg[:, 1] - cv, seg[:, 0] - cu)
            angles = np.mod(angles, 2.0 * np.pi)
            diff = np.abs(np.mod(angles - target_angle + np.pi, 2.0 * np.pi) - np.pi)
            idx = int(np.argmin(diff))

            dist2 = (seg[idx, 0] - cu) ** 2 + (seg[idx, 1] - cv) ** 2
            key = (diff[idx], dist2)
            if key < best_key:
                best_key = key
                best = (seg[idx, 0], seg[idx, 1])

        if best is not None:
            positions.append(best)

    return positions


def output_paths(output, formats):
    """Build output file names from a base name and a list of formats.

    If the user passes ``out.png`` or ``out.pdf``, the extension is stripped
    and treated as a base name, so ``out.png`` with default formats produces
    ``out.png``, ``out.tif``, ``out.eps`` and ``out.pdf``.
    """
    root, ext = os.path.splitext(output)
    known_exts = {".png", ".tif", ".tiff", ".eps", ".pdf", ".jpg", ".jpeg", ".svg"}
    base = root if ext.lower() in known_exts else output
    return [f"{base}.{fmt}" for fmt in formats]


# ---------------------------------------------------------------------------
# Atom labelling for nuclei.
#
# There are two independent sources of atom positions:
#   1. The recommended way — Multiwfn itself appends one line per atom
#      ("Symbol  u  v", the atom's in-plane coordinates) at the end of
#      plane.txt when asked to output the atoms in the plane.  These are
#      already in the exact (u, v) frame of the plot, so nothing can be
#      misaligned.
#   2. Fallback — a standard XYZ file (Angstrom) given with --atoms; the
#      atoms are projected onto the plane recovered from the grid.  Only
#      XYZ is supported on purpose, as it is the most portable and least
#      error-prone structure format.
# ---------------------------------------------------------------------------

BOHR_PER_ANGSTROM = 1.8897261254578961

PERIODIC_TABLE = [
    "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
    "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
    "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
    "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
    "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
    "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]


def symbol_from_token(token):
    """Turn an element token ('C', 'fe', '5', 'Cl') into a proper symbol."""
    s = token.strip()
    if s.isdigit():
        idx = int(s)
        if 1 <= idx < len(PERIODIC_TABLE):
            return PERIODIC_TABLE[idx]
        raise ValueError(f"Unknown atomic number {idx}")
    if not s:
        return None
    return s[0].upper() + s[1:].lower()


def _coords_lines(lines):
    """Yield (symbol, x, y, z in Angstrom) tuples from lines like
    'C   -0.5    1.2    0.0'."""
    for line in lines:
        parts = line.split()
        if len(parts) < 4:
            continue
        sym = symbol_from_token(parts[0])
        if sym is None:
            continue
        try:
            xyz = [float(p) for p in parts[1:4]]
        except ValueError:
            continue
        yield sym, xyz[0], xyz[1], xyz[2]


def _read_xyz(path):
    """XYZ structure file (Angstrom): first two lines are atom count and a
    comment, then one 'symbol  x  y  z' line per atom.

    Tolerant to minor layout quirks: if the standard two-header-line layout
    yields no atoms, we fall back to scanning every line for
    'symbol  x  y  z'.
    """
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()

    def parse(lines_iter):
        return list(_coords_lines(lines_iter))

    atoms = parse(lines[2:]) if len(lines) >= 2 else []
    if not atoms:
        atoms = parse(lines)
    if not atoms:
        raise ValueError(
            f"No atom lines parsed from {path}. Expected standard XYZ format: "
            "'<natom>\\n<comment>\\n<symbol>  x  y  z  ...'"
        )
    symbols = [s for s, *_ in atoms]
    coords = np.array([[x, y, z] for _, x, y, z in atoms])
    return symbols, coords  # keep Angstrom; plane.txt units are auto-detected


def read_structure(path):
    """Read (symbols, cartesian_in_angstrom) from an XYZ file (the only
    format supported on purpose — it is the most portable and least
    error-prone)."""
    ext = os.path.splitext(path)[1].lower()
    if ext != ".xyz":
        raise ValueError(
            f"Unsupported structure file type '{ext}'. This script reads "
            "standard XYZ files (.xyz) only; convert your structure to XYZ "
            "in Angstrom if needed."
        )
    return _read_xyz(path)


def _is_float(token):
    try:
        float(token)
        return True
    except ValueError:
        return False


def parse_plane_file(path):
    """Read a Multiwfn plane.txt and separate the grid from atom lines.

    Returns (grid_array, atoms): ``grid_array`` is the (N, 6) numeric grid
    (Cartesian x y z, plane u v, value); ``atoms`` is a list of
    (symbol, u, v) tuples parsed from the trailing non-grid lines that
    Multiwfn appends when it is asked to output the coordinates of the atoms
    in the plane, or ``None`` if the file has no such lines.
    """
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()

    grid_rows, atom_rows = [], []
    for raw in lines:
        toks = raw.split()
        if not toks:
            continue
        if len(toks) == 6 and all(_is_float(t) for t in toks):
            grid_rows.append(toks)
        elif not toks[0].startswith("#"):
            atom_rows.append(toks)

    if not grid_rows:
        raise ValueError(f"No 6-column grid rows found in {path}")

    grid = np.array([[float(t) for t in row] for row in grid_rows])

    atoms = None
    if atom_rows:
        atoms = []
        for toks in atom_rows:
            sym = next((t for t in toks if not _is_float(t)), None)
            nums = [float(t) for t in toks if _is_float(t)]
            if sym is not None and len(nums) >= 2:
                # Multiwfn writes "Symbol  u  v"; taking the last two numbers
                # also tolerates an extra leading index column.
                atoms.append((symbol_from_token(sym), nums[-2], nums[-1]))
    return grid, atoms



def plane_basis(data):
    """Recover the plane origin and orthonormal axes from the grid.

    plane.txt gives the Cartesian position of every grid point together with
    its in-plane (u, v) coordinates, so the affine map
        cartesian = p0 + u * e1 + v * e2
    is fully determined by three corner points of the rectangular grid.  The
    vectors are unit length in the plane's own length unit (Angstrom or Bohr
    depending on the Multiwfn settings that produced the file).
    """
    u, v = data[:, 3], data[:, 4]
    cart = data[:, :3]
    u0, v0 = u.min(), v.min()
    u1, v1 = u.max(), v.max()

    def pt(ui, vi):
        mask = (np.abs(u - ui) < 1e-8) & (np.abs(v - vi) < 1e-8)
        return cart[mask][0]

    p0 = pt(u0, v0)
    e1 = (pt(u1, v0) - p0) / (u1 - u0)
    e2 = (pt(u0, v1) - p0) / (v1 - v0)
    # The grid corner sits at (u0, v0), not at the plane origin (0, 0).
    # Shift p0 so that the map is cartesian = p0 + u*e1 + v*e2 with the same
    # origin as the (u, v) coordinates in plane.txt.
    p0 = p0 - u0 * e1 - v0 * e2
    return p0, e1, e2


def project_atoms(cart, p0, e1, e2):
    """Project Cartesian positions onto the plane.

    ``cart`` must already be in the plane's length unit.  Returns (u, v, w):
    in-plane coordinates and the signed out-of-plane distance along the plane
    normal, all in the same unit.
    """
    d = cart - p0
    u = d @ e1
    v = d @ e2
    w = d @ np.cross(e1, e2)
    return u, v, w


def project_xyz_atoms(data, z, uu, vv, symbols, cart_angstrom, verbose=False):
    """Project XYZ atoms (Angstrom) onto the plane, auto-detecting the unit.

    Multiwfn can write plane.txt in either Angstrom or Bohr depending on its
    length-unit setting, so we test both hypotheses and keep the one that
    puts the nuclei in the highest-valued region of the plotted field (the
    atoms should sit on the molecule).  Returns
    (u, v, w, unit_label) in the plane's unit.
    """
    p0, e1, e2 = plane_basis(data)
    candidates = []
    for label, scale in (("Angstrom", 1.0), ("Bohr", BOHR_PER_ANGSTROM)):
        ua, va, w = project_atoms(cart_angstrom * scale, p0, e1, e2)
        iu = np.clip(np.searchsorted(uu, ua), 0, len(uu) - 1)
        iv = np.clip(np.searchsorted(vv, va), 0, len(vv) - 1)
        elf = np.nan_to_num(z[iv, iu], nan=0.0)
        candidates.append((float(elf.mean()), label, scale, ua, va, w))

    candidates.sort(key=lambda c: c[0], reverse=True)
    score, unit_label, scale, ua, va, w = candidates[0]
    if verbose:
        for s, label, *_ in candidates:
            print(f"  unit hypothesis {label:>9}: mean field at nuclei = {s:.3f}")
        print(f"  -> plane.txt interpreted as {unit_label}")
    return ua, va, w, unit_label


def draw_atoms(ax, symbols, ua, va, w, plane_cutoff, label_size,
               show_out_of_plane, xlim, ylim):
    """Overlay element-symbol labels on the atom nuclei.

    Kept deliberately plain so the ELF map stays accurate: the element symbol
    is drawn as centred plain text exactly on the nucleus, with no background
    and no offset — nothing opaque is painted over the density.

    Atoms within ``plane_cutoff`` of the plane are drawn normally; atoms
    farther away are drawn as faint labels only when ``show_out_of_plane`` is
    set.  Atoms that project outside the plotted rectangle are skipped.
    """
    for sym, ui, vi, wi in zip(symbols, ua, va, w):
        if not (xlim[0] <= ui <= xlim[1] and ylim[0] <= vi <= ylim[1]):
            continue
        if abs(wi) <= plane_cutoff:
            ax.text(
                ui, vi, sym,
                ha="center", va="center",
                fontsize=label_size, color="black", zorder=6,
            )
        elif show_out_of_plane:
            ax.text(
                ui, vi, sym,
                ha="center", va="center",
                fontsize=label_size * 0.85, color="0.45", zorder=6,
            )


def main():
    parser = argparse.ArgumentParser(
        description="Plot a Multiwfn plane.txt scalar-field map with matplotlib."
    )
    parser.add_argument("plane", help="Multiwfn plane.txt")
    parser.add_argument(
        "-o", "--output",
        default="plane_map",
        help="Base output name (extension is optional). Default: %(default)s",
    )
    parser.add_argument(
        "--width",
        type=float,
        default=7.2,
        help="Figure width in inches. Default: %(default)s",
    )
    parser.add_argument(
        "--height",
        type=float,
        default=6.6,
        help="Figure height in inches. Default: %(default)s",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=400,
        help="Raster resolution in dots per inch (used for PNG/TIF). "
             "Default: %(default)s",
    )
    parser.add_argument(
        "--formats",
        default="png,tif,eps,pdf",
        help="Comma-separated output formats. Default: %(default)s",
    )
    parser.add_argument(
        "--cmap",
        default="viridis",
        help="Matplotlib colormap.  Try 'viridis' (default), 'plasma', "
             "'turbo', or 'coolwarm' for a blue=0 / red=1 dual-colour map.",
    )
    parser.add_argument(
        "--no-contour-labels",
        action="store_true",
        help="Do not draw contour-line value labels.",
    )
    parser.add_argument(
        "--atoms",
        default=None,
        metavar="FILE.xyz",
        help="XYZ structure file (coordinates in Angstrom). Each nucleus is "
             "projected onto the plane and labelled with its element symbol. "
             "The length unit of plane.txt (Angstrom or Bohr) is "
             "auto-detected.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print each atom's projected plane coordinates (u, v) and its "
             "distance w from the plane (same unit as the axes) to diagnose "
             "misplaced labels.",
    )
    parser.add_argument(
        "--plane-cutoff",
        type=float,
        default=1.0,
        help="Max |distance from the plane| (in the plane's length unit, "
             "auto-detected as Angstrom or Bohr) for an atom to be drawn as "
             "a solid nucleus. Default: %(default)s",
    )
    parser.add_argument(
        "--atom-label-size",
        type=float,
        default=9,
        help="Font size of the element-symbol labels. Default: %(default)s",
    )
    parser.add_argument(
        "--show-out-of-plane",
        action="store_true",
        help="Also draw atoms farther than --plane-cutoff from the plane as "
             "faint hollow labels.",
    )
    args = parser.parse_args()

    setup_latex_rendering()
    setup_fonts("Arial")

    data, plane_atoms = parse_plane_file(args.plane)
    if data.ndim != 2 or data.shape[1] < 6:
        raise ValueError(f"Expected at least 6 columns, got {data.shape}")

    # Multiwfn plane.txt:
    # col 1-3 = Cartesian X/Y/Z of each grid point
    # col 4-5 = local plane coordinates
    # col 6   = scalar field (ELF here)
    u, v, val = data[:, 3], data[:, 4], data[:, 5]

    uu = np.unique(u)
    vv = np.unique(v)
    if len(uu) * len(vv) != len(data):
        raise ValueError("Input is not a complete rectangular plane grid")

    iu = np.searchsorted(uu, u)
    iv = np.searchsorted(vv, v)
    z = np.full((len(vv), len(uu)), np.nan)
    z[iv, iu] = val
    U, V = np.meshgrid(uu, vv)

    # Use the exact data extent.  Do not extend the view to "centre" the
    # molecule: if the Multiwfn plane is smaller than the molecule, extending
    # the limits only adds blank margins at the upper/right edges.
    cu, cv = molecule_center(u, v, val)  # only used to spread contour labels
    xlim = (uu.min(), uu.max())
    ylim = (vv.min(), vv.max())

    fig, ax = plt.subplots(figsize=(args.width, args.height))
    cf = ax.contourf(
        U, V, z,
        levels=np.linspace(0.0, 1.0, 101),
        cmap=args.cmap,
        vmin=0.0,
        vmax=1.0,
    )

    cs = ax.contour(
        U, V, z,
        levels=[0.5, 0.7, 0.8, 0.9],
        linewidths=0.7,
        colors="black",
    )
    if not args.no_contour_labels:
        label_positions = contour_label_positions(cs, cu, cv)
        if label_positions:
            ax.clabel(
                cs,
                manual=label_positions,
                fmt="%.1f",
                fontsize=7,
                inline=True,
                inline_spacing=4,
            )

    # --- atom labelling ---------------------------------------------------
    # Priority: the atom lines that Multiwfn itself appended to plane.txt are
    # already in the exact (u, v) frame of the plot and can never be
    # misaligned.  Only when they are absent do we fall back to projecting an
    # XYZ file.
    length_unit = "Å"  # updated below when the unit can be determined
    use_plane_atoms = plane_atoms is not None
    if args.atoms or use_plane_atoms:
        if use_plane_atoms:
            symbols = [s for s, _, _ in plane_atoms]
            ua = np.array([ui for _, ui, _ in plane_atoms])
            va = np.array([vi for _, _, vi in plane_atoms])
            w = np.zeros_like(ua)  # Multiwfn already gave in-plane positions
            if args.verbose:
                print(f"Using the {len(symbols)} atom lines at the end of "
                      f"{args.plane} (multiwfn in-plane coordinates):")
                for s, ui, vi in zip(symbols, ua, va):
                    inside = xlim[0] <= ui <= xlim[1] and ylim[0] <= vi <= ylim[1]
                    print(f"  {s:>2}  u={ui:8.3f}  v={vi:8.3f}  "
                          f"{'inside' if inside else 'OUTSIDE plot'}")
        else:
            symbols, atom_cart = read_structure(args.atoms)
            ua, va, w, length_unit = project_xyz_atoms(
                data, z, uu, vv, symbols, atom_cart, verbose=args.verbose)
            if args.verbose:
                print(f"Projected nuclei (u,v,w in {length_unit}; "
                      f"plot range u=[{xlim[0]:.2f},{xlim[1]:.2f}] "
                      f"v=[{ylim[0]:.2f},{ylim[1]:.2f}]):")
                for s, ui, vi, wi in zip(symbols, ua, va, w):
                    inside = xlim[0] <= ui <= xlim[1] and ylim[0] <= vi <= ylim[1]
                    status = []
                    if not inside:
                        status.append("OUTSIDE plot")
                    if abs(wi) > args.plane_cutoff:
                        status.append("OUT-OF-PLANE")
                    status = "/".join(status) if status else "ok"
                    print(f"  {s:>2}  u={ui:8.3f}  v={vi:8.3f}  "
                          f"w={wi:+7.3f}  {status}")
        draw_atoms(ax, symbols, ua, va, w, args.plane_cutoff,
                   args.atom_label_size, args.show_out_of_plane,
                   xlim, ylim)

    cbar = fig.colorbar(cf, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_ticks(np.linspace(0.0, 1.0, 6))  # clean, evenly-spaced scale

    label_fontsize = mpl.rcParams["font.size"] + 1
    ax.set_xlabel(
        f"Plane coordinate $u$  ({length_unit})",
        fontsize=label_fontsize,
    )
    ax.set_ylabel(
        f"Plane coordinate $v$  ({length_unit})",
        fontsize=label_fontsize,
    )
    ax.set_aspect("equal")
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)

    fig.tight_layout()
    align_colorbar_with_axes(ax, cbar)

    formats = [
        fmt.strip().lstrip(".")
        for fmt in args.formats.split(",")
        if fmt.strip()
    ]
    output_files = output_paths(args.output, formats)
    for path in output_files:
        try:
            fig.savefig(path, dpi=args.dpi, bbox_inches="tight")
            print(f"Saved: {path}")
        except Exception as exc:
            print(f"Warning: could not save {path}: {exc}")


if __name__ == "__main__":
    main()
