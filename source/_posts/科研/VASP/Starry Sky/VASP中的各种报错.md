---
title: VASP中的各种报错
date: 2025-04-14 16:40
tags: [化学, 科研]
categories: [从零开始的科研之旅, VASP]
cover: cover.png
---

如题，记录一下在计算时遇到的各种报错

## 2025.05.14

```bash
 -----------------------------------------------------------------------------
|                                                                             |
|     EEEEEEE  RRRRRR   RRRRRR   OOOOOOO  RRRRRR      ###     ###     ###     |
|     E        R     R  R     R  O     O  R     R     ###     ###     ###     |
|     E        R     R  R     R  O     O  R     R     ###     ###     ###     |
|     EEEEE    RRRRRR   RRRRRR   O     O  RRRRRR       #       #       #      |
|     E        R   R    R   R    O     O  R   R                               |
|     E        R    R   R    R   O     O  R    R      ###     ###     ###     |
|     EEEEEEE  R     R  R     R  OOOOOOO  R     R     ###     ###     ###     |
|                                                                             |
|     ERROR FEXCF: supplied exchange-correlation table                        |
|      is too small, maximal index : 7355                                     |
|                                                                             |
|       ---->  I REFUSE TO CONTINUE WITH THIS SICK JOB ... BYE!!! <----       |
|                                                                             |
 -----------------------------------------------------------------------------
```

删除`NPAR = 1`参数

