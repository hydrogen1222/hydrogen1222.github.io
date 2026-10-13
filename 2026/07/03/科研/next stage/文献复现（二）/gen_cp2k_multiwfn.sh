#!/bin/bash
# =============================================================================
# convert_multiwfn.sh —— 用无 GUI 版 Multiwfn 批量把 *.restart 转成 .cif
#
# 原理:Multiwfn 是交互式的,但它从标准输入读菜单选择。用 heredoc 把你手点的
#       那串数字一次性喂进去,就能非交互地批量跑。这套"喂菜单"模式以后转任何
#       格式都能复用——把下面 heredoc 里的数字换成你需要的菜单路径即可。
#
# 你的转换路径(按你描述):载入文件 -> 100 -> 2 -> 33 -> 回车(默认文件名) -> 0 -> q
#
# 用法:先把下面 MULTIWFN 改成你的可执行文件路径,然后:
#        bash convert_multiwfn.sh            # 当前目录下所有子文件夹
#        bash convert_multiwfn.sh /path/to/root
#
# =============================================================================
shopt -s nullglob
MULTIWFN="/home/ctan/Multiwfn_3.8_dev_bin_Linux_noGUI/Multiwfn_noGUI"          # <<< 改成你的 Multiwfn 可执行文件路径
root="${1:-.}"

if [[ ! -x "$MULTIWFN" ]]; then
    echo "找不到可执行的 Multiwfn: $MULTIWFN  —— 请先修改脚本里的 MULTIWFN 变量"
    exit 1
fi

# 先收集所有要转换的文件（方便显示总数）
files=("$root"/*/*.cif)
total=${#files[@]}
n=0

for f in "${files[@]}"; do
    dir=$(dirname "$f")
    base=$(basename "$f")
    
    # 打印开始日志（带进度）
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始 ($((n+1))/$total): $base"
    
    # 执行转换，所有 Multiwfn 界面输出全部丢到黑洞，终端只留上面那行日志
    ( cd "$dir" && "$MULTIWFN" "$base" >/dev/null 2>&1 <<'EOF'
100
2
25

1
32
8
4,4,4
0
0
q
EOF
    )
    
    # 打印结果日志（成功或失败，一行）
    if [[ $? -eq 0 ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 完成 ($((n+1))/$total): $base"
        n=$((n+1))
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 失败 ($((n+1))/$total): $base"
    fi
done

echo "============================================"
echo "共转换 $n 个文件，失败 $((total - n)) 个。"
