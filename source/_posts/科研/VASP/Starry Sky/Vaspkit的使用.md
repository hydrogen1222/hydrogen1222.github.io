---
title: Vaspkit的使用
date: 2025-05-12 10:40
tags: [化学, 科研]
categories: [从零开始的科研之旅, VASP]
cover: cover.png
---

安装、配置好`vaspkit`之后输入`vaspkit`可启动软件包

```bash
(base) storm@DESKTOP-HE4FQ8Q:~/my-learn/trash-vaspkit$ vaspkit
            \\\///
           / _  _ \         Hey, you must know what you are doing.
         (| (o)(o) |)       Otherwise you might get wrong results.
 o-----.OOOo--()--oOOO.------------------------------------------o
 |         VASPKIT Standard Edition 1.5.1 (27 Jan. 2024)         |
 |         Lead Developer: Vei WANG (wangvei@icloud.com)         |
 |      Main Contributors: Gang TANG, Nan XU & Jin-Cheng LIU     |
 |  Online Tutorials Available on Website: https://vaspkit.com   |
 o-----.oooO-----------------------------------------------------o
        (   )   Oooo.                          VASPKIT Made Simple
         \ (    (   )
          \_)    ) /
                (_/
 ===================== Structural Utilities ======================
 01) VASP Input-Files Generator    02) Mechanical Properties
 03) K-Path for Band-Structure     04) Structure Editor
 05) Catalysis-ElectroChem Kit     06) Symmetry Analysis
 07) Materials Databases           08) Advanced Structure Models
 ===================== Electronic Utilities ======================
 11) Density-of-States             21) Band-Structure
 23) 3D Band-Structure             25) Hybrid-DFT Band-Structure
 26) Fermi-Surface                 28) Band-Structure Unfolding
 31) Charge-Density Analysis       42) Potential Analysis
 44) Piezoelectric Properties      51) Wave-Function Analysis
 62) Magnetic Analysis             65) Spin-Texture
 68) Transport Properties
 ======================== Misc Utilities =========================
 71) Optical Properties            72) Molecular-Dynamics Kit
 74) User Interface                78) VASP2other Interface
 84) ABACUS Interface              91) Semiconductor Kit
 92) 2D-Material Kit               95) Phonon Analysis
 0)  Quit
 ------------>>
```

以下是中文翻译对照：

```
===================== 结构工具 ======================
01) VASP 输入文件生成器
02) 力学性质
03) 能带结构的 K 路径
04) 结构编辑器
05) 催化 - 电化学套件
06) 对称性分析
07) 材料数据库
08) 高级结构模型
==================== 电子工具 ======================
11) 密度态
21) 能带结构
23) 三维能带结构
25) 混合 DFT 能带结构
26) 费米面
28) 能带结构展开
31) 电荷密度分析
42) 势分析
44) 压电性质
51) 波函数分析
62) 磁性分析
65) 自旋纹理
68) 输运性质
====================== 杂项工具 ========================
71) 光学性质
72) 分子动力学套件
74) 用户界面
78) VASP 转其他格式接口
84) ABACUS 接口
91) 半导体套件
92) 二维材料套件
95) 声子分析
0) 退出
```

我目前还是初学者小白，使用得最多的功能还是生成输入文件功能尤其是生成`INCAR`文件，

```bash
 ------------>>
01
 ==================== VASP Input Files Options ===================
 101) Customize INCAR File
 102) Generate KPOINTS File for SCF Calculation
 103) Generate POTCAR File with Default Setting
 104) Generate POTCAR File with User Specified Potential
 105) Generate POSCAR File from cif (no fractional occupations)
 106) Generate POSCAR File from Material Studio xsd (retain fixes)
 107) Reformat POSCAR File in Specified Order of Elements
 108) Successive Procedure to Generate VASP Files and Check
 109) Submit Job Queue

 0)   Quit
 9)   Back
 ------------>>
  ------------>>
101
 +---------------------------- Tip ------------------------------+
 |          WARNNING: You MUST know what wou are doing!          |
 |Some Parameters in INCAR file need to be set/adjusted manually.|
 +---------------------------------------------------------------+
 ======================== INCAR Options ==========================
 ST) Static-Calculation            SR) Standard Relaxation
 MG) Magnetic Properties           SO) Spin-Orbit Coupling
 D3) DFT-D3 no-damping Correction  H6) HSE06 Calculation
 PU) DFT+U Calculation             MD) Molecular Dynamics
 GW) GW0 Calculation               BS) BSE Calculation
 DC) Elastic Constant              EL) ELF Calculation
 BD) Bader Charge Analysis         OP) Optical Properties
 EC) Static Dielectric Constant    PC) Decomposed Charge Density
 PH) Phonon-Calculation            PY) Phonon with Phononpy
 NE) Nudged Elastic Band (NEB)     DM) The Dimer Method
 FQ) Frequence Calculation         LR) Lattice Relaxation
 MT) Meta-GGA Calculation          PZ) Piezoelectric Calculation

 0)   Quit
 9)   Back
 ------------>>
 Input Key-Parameters (STH6D3 means HSE06-D3 Static-Calcualtion)
```

以下是中文对照：

```
+---------------------------- 提示 ------------------------------+
|          警告：你必须清楚自己在做什么！          |
|INCAR 文件中的一些参数需要手动设置/调整。|
+---------------------------------------------------------------+
======================= INCAR 选项 ==========================
ST) 静态计算            SR) 标准松弛
MG) 磁性性质            SO) 自旋轨道耦合
D3) DFT-D3 无阻尼校正  H6) HSE06 计算
PU) DFT+U 计算          MD) 分子动力学
GW) GW0 计算            BS) BSE 计算
DC) 弹性常数            EL) ELF 计算
BD) Bader 电荷分析      OP) 光学性质
EC) 静态介电常数        PC) 分解电荷密度
PH) 声子计算            PY) 使用 Phonopy 的声子计算
NE) 强制弹性带（NEB）   DM) 二聚体方法
FQ) 频率计算            LR) 晶格松弛
MT) Meta-GGA 计算       PZ) 压电计算
```

`LR`晶格弛豫就对应着结构优化，当然生成的`INCAR`文件可能仍需要进行一些修改，比如`ENCUT`可能需要调整为赝势中`ENMAX`的1.3倍

## 生成KPOINTS文件

对于**非能带的计算**，选择` 102) Generate KPOINTS File for SCF Calculation`使用程序自动撒点即可，但是需要用户选择撒点方式和撒点密度，选择`Gamma Scheme`，使用0.04精度

> 关于生成 KPOINTS 文件
>
> - 在 VASP 计算中，KPOINTS 文件用于指定 k 点网格的设置。对于非能带计算，比如进行能量计算、优化结构等，通常不需要像计算能带结构那样沿特定的高对称路径采样 k 点，而是可以在整个布里渊区均匀地分布 k 点，这就是所说的 “自动撒点”。
>
> 撒点方式
>
> - **Monkhorst-Pack 方式** ：这是最常用的自动撒点方式。它通过指定一组三个整数（nx, ny, nz），在三个倒易晶格方向上均匀地分布 k 点，形成的网格可以系统地逼近布里渊区的积分。例如，对于简单晶格，若指定 k 点网格为 3×3×3，程序就会按照 Monkhorst-Pack 方式在这三个方向各取 3 个点，生成一个均匀分布的 k 点网格。
> - **Gamma 方式** ：这种方式会在 k 点网格中包含 Γ 点（布里渊区的中心点）。对于金属等具有高对称性的材料，在 Γ 点附近采样很重要，这时候 Gamma 方式撒点更合适。比如指定 k 点网格为 4×4×4 并采用 Gamma 方式撒点，生成的网格会以 Γ 点为中心，向周围均匀分布其他 k 点。
>
> K 点密度
>
> - K 点密度指的是在布里渊区单位体积内分布的 k 点数量，它决定了 k 点网格的疏密程度。较高的 K 点密度意味着更精细地采样布里渊区，能够更精确地计算系统的物理性质，但也会增加计算量和资源消耗。
> - 例如，对于一个计算资源充足的大型超算任务，为了获得高精度结果，可以选择较大的 K 点密度，如 8×8×8 甚至更高；而对于初步探索或计算资源有限的情况，可以适当降低 K 点密度，如 4×4×4。

生成`KPOINTS`的同时，`POTCAR`也会被自动生成，前提是在vaspkit的配置文件中正确设置了赝势的路径和赝势稳健的种类（默认type为PBE）

