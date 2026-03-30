---
title: 一些简单的Linux命令
date: 2025-04-14 16:40:40
tags: [化学, 科研]
categories: [从零开始的科研之旅, VASP]
cover: cover.png
---



使用for循环批量创建文件夹

```bash
for i in {2..9}; do cp 0.01 0.0$i -r ; done
```

使用sed命令不打开文件而进行替换

```bash
sed '3s/0.01/0.02/g' ICNAR
```

> 对第三行(3)出现的所有0.01(g,全局替换)进行替换(s表示替换操作)，替换为0.02，只输出替换后的结果
>
> sed '3/0.01/0.02/g' INCAR > INCAR最后什么也没有
>
> 加上-i参数可以直接进行编辑

结合for循环和sed批量命名

```bash
[storm@cachyos-x8664 ex03]$ for i in *; do sed -i "3s/0.05/$i/g" $i/INCAR ; done
[storm@cachyos-x8664 ex03]$ grep SIGMA */INCAR
0.01/INCAR:SIGMA = 0.01
0.02/INCAR:SIGMA = 0.02
0.03/INCAR:SIGMA = 0.03
0.04/INCAR:SIGMA = 0.04
0.05/INCAR:SIGMA = 0.05
0.06/INCAR:SIGMA = 0.06
0.07/INCAR:SIGMA = 0.07
0.08/INCAR:SIGMA = 0.08
0.09/INCAR:SIGMA = 0.09
```

> 使用双引号以读取变量的值

注意这里使用的是英文括号而不是花括号

```bash
for i in $(seq 8 2 16); do cp 888/POSCAR ${i}${i}${i}/POSCAR; done
```

"提交任务的命令"

```bash
yhbatch -p gsc -N 1 -J test job_sub 
```

找能量的命令

```bash
grep  without OUTCAR | tail -n 1
grep '  without' OUTCAR | tail -n 1  # 本人常用的是这个
grep sigma OUTCAR | tail -n 1 
```

提交任务，多个文件夹

```bash
for i in *; do cd $i ; vasp1; cd $OLDPWD; done
```

> alias vasp1='mpirun -n 8 vasp'

输出时间信息

```bash
for i in *0; do echo -e  $i "\t" $(grep User $i/OUTCAR | awk '{print $4}'); done
```

绘图脚本

```python
import matplotlib.pyplot as plt
import numpy as np

x,y = np.loadtxt('data.dat', delimiter =  ',',
      usecols=(0,1), unpack=True)
plt.xlabel('ENCUT / eV')
plt.ylabel('Ttme / S')
plt.plot(x,y, 'rs-', linewidth=2.0)
plt.show()
```

在vim中进行替换

```bash
: 10,30s/$/T T T/g
```

> $表示每一行的末尾

提取能量（用制表符TAB进行分隔）

```bash
for i in [0-9]*/; do
  dir=${i%/}
  energy=$(grep '  without' "$dir/OUTCAR" | tail -n 1 | awk '{print $7}')
  printf "%s\t%s\n" "$dir" "$energy"
done > data
```


