---
title: np.asmatrix函数被废弃使得CIF转POSCAR脚本报错
date: 2025-08-12 17:00
tags: [化学, 科研]
categories: [从零开始的科研之旅, VASP]
cover: cover.png
---

使用最新版的`Miniconda3`，`python`环境的版本是14.x，顺手`pip install numpy`安装的`numpy`版本过高，使用`vaspkit`尝试将`.cif`文件转换为`POSCAR`时报错:

```python
AttributeError: `np.mat` was removed in the NumPy 2.0 release. Use `np.asmatrix` instead
```

错误原因在于当前的`NumPy`版本太新（>=2.0），而`vaspkit`的`cif2pos.py`脚本中使用了已被移除的`np.mat`函数，最简单的方式是降级`numpy`版本：

```python
pip install numpy==1.26.4
```

