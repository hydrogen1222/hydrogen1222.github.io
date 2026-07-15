#!/bin/bash
shopt -s nullglob

# 你的提交脚本
SLURM_SCRIPT=/home/ctan/cp2k/cp2k-2026.1/submit_cp2k_mpi.slurm
MAX_JOBS=2
count=0

# 【保险一】直接写死你的实际用户名，绝对不依赖可能会变空的环境变量
MY_USER="ctan"

echo "开始执行滑动窗口智能提交..."

for folder in */; do
    while true; do
        # 【保险二】屏蔽报错干扰 (2>/dev/null)，确保只拿到纯粹的数字
        current_jobs=$(squeue -u "$MY_USER" -h 2>/dev/null | wc -l)
        
        if [ "$current_jobs" -lt "$MAX_JOBS" ]; then
            break # 终于有空位了，跳出休眠去提交
        fi
        
        echo "[$(date +'%H:%M:%S')] 当前名下任务数: $current_jobs/$MAX_JOBS，队列已满，休眠 30 秒..."
        sleep 30
    done

    echo "============================================"
    echo "提交任务至目录: $folder"
    ( cd "$folder" && sbatch "$SLURM_SCRIPT" )
    
    count=$((count+1))
    
    # 【保险三】提交完强制挂机 5 秒！等 Slurm 的 squeue 刷新状态，防止一瞬间连发
    sleep 5
done

echo "============================================"
echo "Every directory has been resolved! 共接力投递 $count 个任务。"
