---
title: 截断能ENCUT的选取
date: 2025-04-29 21:40
tags: [化学, 科研]
categories: [从零开始的科研之旅, VASP]
cover: cover.png
---

>  `ENCUT`是用来指定平面波基组能量截止值的参数

以上是wiki对`ENCUT`的描述，`POTCAR`文件中已经包含了元素的`ENMAX`和`ENMIN`，这也是互联网上对`ENCUT`的选择方案对通常是1.3倍的`ENMAX`

侯柱峰老师提供了另外一种方法并指出通过该方法选择的`ENCUT`通常能满足1.3倍`ENMAX`，供参考使用

截断能指定了用于波函数展开的平面波基组的截断能量，此能量越大则用来描述波函数的平面波基组越多，精度越高，但计算也越耗时。

可以通过计算测试来选择合适的`ENCUT`。

以下是用于测试的脚本：

```bash
#!/bin/sh
rm WAVECAR
for i in 150 200 250 300 350 400
do
cat > INCAR <<!
SYSTEM = Si-Diamond
ENCUT = $i
ISTART = 0 ; ICHARG = 2
ISMEAR = -5
PREC = Accurate
!
echo "ENCUT = $i eV" ; time vasp
E=`grep "TOTEN" OUTCAR | tail -1 | awk '{printf "%12.6f \n", $5 }'`
echo $i $E >>comment
done
```

计算后会得到`comment`文件，它列出了在不同`ENCUT`下计算得到的总能量

```bash
150 -11.900655
200 -11.938864
250 -11.944599
300 -11.945248
350 -11.945503
400 -11.945622
```

==总能量变化在0.001 eV即可==，因此在这个例子中`ENCUT`可以选择250

