---
title: 各家厂商的大模型API对比
date: 2026-06-21 11:36:14
categories:
  - 计算机科学与技术？
tags:
  - 折腾
cover: cover.png
---

> 最后核对：2026-08-29。
>
> 本文的筛选范围和计算方法见下方“价格总表”。价格、模型状态和限速都可能随时调整，正式使用前请打开文末的官方页面确认。

## 价格总表

> 本文只比较文本生成和多模态理解模型的 API 按量计费。除特别注明外，价格单位均为人民币元 / 100 万 tokens；输入价格采用“缓存命中 / 未命中”顺序。价格、模型状态和限速都可能调整，正式使用前请打开文末的官方页面确认。
>
> 版本口径按本次筛选要求：OpenAI 最多保留 GPT-5.4 家族；月之暗面最多保留 Kimi K2.7；Qwen 只保留 Qwen3.5 主力型号；其他厂商只保留当前主力代际的 canonical model ID。embedding/向量、图像生成、音频、重排序等专用模型不纳入表格。
>
> ChatAnywhere 只统计默认、低价、优惠三个付费分组，排除 modelGroup=99 的免费分组。官方直连、SiliconFlow 和 ChatAnywhere 的每个价格来源或计费档均单独列行，不再把不同来源压成一行。
>
> 表格按“模型平均综合价”从低到高排序，同一模型的多条来源记录使用相同排名。来源综合价 =（未命中输入价 + 输出价）/ 2；模型平均综合价 = 该模型所有已列付费来源/计费档的来源综合价算术平均。ChatAnywhere 的不同付费分组、DeepSeek 官方的空闲/高峰时段、MiniMax 的输入长度档位都作为独立价格项参与平均。
>
> ChatAnywhere 价格页标注无折扣时 1 CA = 1 RMB；因此下表统一按人民币元 / 100 万 tokens 展示。没有缓存价的平台只填写单一输入价。本表共包含 25 个规范模型、64 条来源/计费档价格记录。

| 排名 | 规范模型 | 来源 / 平台模型 ID | 上下文 / 计费档 | 输入价格（命中 / 未命中） | 输出价格 | 来源综合价 | 模型平均综合价 |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| 1 | `step-3.5-flash` | SiliconFlow / `stepfun-ai/Step-3.5-Flash` | 256K | 0.7 | 2.1 | 1.4 | 1.4 |
| 2 | `qwen3.5-plus` | ChatAnywhere 默认 / `qwen3.5-plus` | 按页面分组 | 0.56 | 3.36 | 1.96 | 1.96 |
| 2 | `qwen3.5-plus` | ChatAnywhere 优惠 / `qwen3.5-plus` | 按页面分组 | 0.56 | 3.36 | 1.96 | 1.96 |
| 3 | `gpt-oss-20b` | ChatAnywhere 默认 / `gpt-oss-20b` | 按页面分组 | 0.8 | 3.2 | 2 | 2 |
| 3 | `gpt-oss-20b` | ChatAnywhere 优惠 / `gpt-oss-20b` | 按页面分组 | 0.8 | 3.2 | 2 | 2 |
| 4 | `qwen3.5-397b-a17b` | ChatAnywhere 默认 / `qwen3.5-397b-a17b` | 按页面分组 | 0.84 | 5.04 | 2.94 | 2.94 |
| 4 | `qwen3.5-397b-a17b` | ChatAnywhere 优惠 / `qwen3.5-397b-a17b` | 按页面分组 | 0.84 | 5.04 | 2.94 | 2.94 |
| 5 | `deepseek-v4-flash` | DeepSeek 官方（空闲） / `deepseek-v4-flash` | 1M；最大输出 384K | 0.05（命中） / 1.5（未命中） | 4.5 | 3 | 3.06 |
| 5 | `deepseek-v4-flash` | DeepSeek 官方（高峰） / `deepseek-v4-flash` | 1M；最大输出 384K | 0.10（命中） / 3.0（未命中） | 9.0 | 6 | 3.06 |
| 5 | `deepseek-v4-flash` | SiliconFlow / `deepseek-ai/DeepSeek-V4-Flash` | 1M | 1.0 | 2.0 | 1.5 | 3.06 |
| 5 | `deepseek-v4-flash` | ChatAnywhere 默认 / `deepseek-v4-flash` | 按页面分组 | 1.2 | 3.6 | 2.4 | 3.06 |
| 5 | `deepseek-v4-flash` | ChatAnywhere 优惠 / `deepseek-v4-flash` | 按页面分组 | 1.2 | 3.6 | 2.4 | 3.06 |
| 6 | `gpt-5.4-nano` | ChatAnywhere 默认 / `gpt-5.4-nano` | 按页面分组 | 1.4 | 8.75 | 5.075 | 3.9875 |
| 6 | `gpt-5.4-nano` | ChatAnywhere 优惠 / `gpt-5.4-nano` | 按页面分组 | 0.8 | 5 | 2.9 | 3.9875 |
| 7 | `deepseek-v4-flash-vision-exp` | DeepSeek 官方（空闲） / `deepseek-v4-flash-vision-exp` | 1M；最大输出 384K | 0.05（命中） / 1.5（未命中） | 4.5 | 3 | 4.5 |
| 7 | `deepseek-v4-flash-vision-exp` | DeepSeek 官方（高峰） / `deepseek-v4-flash-vision-exp` | 1M；最大输出 384K | 0.10（命中） / 3.0（未命中） | 9.0 | 6 | 4.5 |
| 8 | `gemini-3.5-flash-lite` | ChatAnywhere 默认 / `gemini-3.5-flash-lite` | 按页面分组 | 1.2 | 10 | 5.6 | 5.6 |
| 8 | `gemini-3.5-flash-lite` | ChatAnywhere 优惠 / `gemini-3.5-flash-lite` | 按页面分组 | 1.2 | 10 | 5.6 | 5.6 |
| 9 | `minimax-m3` | MiniMax 官方（输入 ≤512K） / `MiniMax-M3` | 1M | 0.42 / 2.10 | 8.40 | 5.25 | 6.0375 |
| 9 | `minimax-m3` | MiniMax 官方（输入 >512K） / `MiniMax-M3` | 1M | 0.84 / 4.20 | 16.80 | 10.5 | 6.0375 |
| 9 | `minimax-m3` | ChatAnywhere 默认 / `minimax-m3` | 按页面分组 | 1.68 | 6.72 | 4.2 | 6.0375 |
| 9 | `minimax-m3` | ChatAnywhere 优惠 / `minimax-m3` | 按页面分组 | 1.68 | 6.72 | 4.2 | 6.0375 |
| 10 | `gemini-3-flash-preview` | ChatAnywhere 默认 / `gemini-3-flash-preview` | 按页面分组 | 2 | 12 | 7 | 7 |
| 10 | `gemini-3-flash-preview` | ChatAnywhere 优惠 / `gemini-3-flash-preview` | 按页面分组 | 2 | 12 | 7 | 7 |
| 11 | `gpt-oss-120b` | ChatAnywhere 默认 / `gpt-oss-120b` | 按页面分组 | 4.4 | 17.6 | 11 | 11 |
| 11 | `gpt-oss-120b` | ChatAnywhere 优惠 / `gpt-oss-120b` | 按页面分组 | 4.4 | 17.6 | 11 | 11 |
| 12 | `deepseek-v4-pro` | DeepSeek 官方（空闲） / `deepseek-v4-pro` | 1M；最大输出 384K | 0.15（命中） / 4.5（未命中） | 13.5 | 9 | 12.6 |
| 12 | `deepseek-v4-pro` | DeepSeek 官方（高峰） / `deepseek-v4-pro` | 1M；最大输出 384K | 0.30（命中） / 9.0（未命中） | 27.0 | 18 | 12.6 |
| 12 | `deepseek-v4-pro` | SiliconFlow / `deepseek-ai/DeepSeek-V4-Pro` | 1M | 12.0 | 24.0 | 18 | 12.6 |
| 12 | `deepseek-v4-pro` | ChatAnywhere 默认 / `deepseek-v4-pro` | 按页面分组 | 4.5 | 13.5 | 9 | 12.6 |
| 12 | `deepseek-v4-pro` | ChatAnywhere 优惠 / `deepseek-v4-pro` | 按页面分组 | 4.5 | 13.5 | 9 | 12.6 |
| 13 | `kimi-k2.6` | Moonshot 官方直连 / `kimi-k2.6` | 256K | 1.1（命中） / 6.5（未命中） | 27 | 16.75 | 13.4 |
| 13 | `kimi-k2.6` | ChatAnywhere 默认 / `kimi-k2.6` | 按页面分组 | 4.55 | 18.9 | 11.725 | 13.4 |
| 13 | `kimi-k2.6` | ChatAnywhere 优惠 / `kimi-k2.6` | 按页面分组 | 4.55 | 18.9 | 11.725 | 13.4 |
| 14 | `gpt-5.4-mini` | ChatAnywhere 默认 / `gpt-5.4-mini` | 按页面分组 | 5.25 | 31.5 | 18.375 | 14.4375 |
| 14 | `gpt-5.4-mini` | ChatAnywhere 优惠 / `gpt-5.4-mini` | 按页面分组 | 3 | 18 | 10.5 | 14.4375 |
| 15 | `claude-haiku-4-5-20251001` | ChatAnywhere 默认 / `claude-haiku-4-5-20251001` | 按页面分组 | 5 | 25 | 15 | 15 |
| 15 | `claude-haiku-4-5-20251001` | ChatAnywhere 优惠 / `claude-haiku-4-5-20251001` | 按页面分组 | 5 | 25 | 15 | 15 |
| 16 | `kimi-k2.7-code` | Moonshot 官方直连 / `kimi-k2.7-code` | 256K | 1.3（命中） / 6.5（未命中） | 27 | 16.75 | 15.075 |
| 16 | `kimi-k2.7-code` | SiliconFlow / `moonshotai/Kimi-K2.7-Code` | 256K | 6.5 | 27.0 | 16.75 | 15.075 |
| 16 | `kimi-k2.7-code` | ChatAnywhere 默认 / `kimi-k2.7-code` | 按页面分组 | 5.2 | 21.6 | 13.4 | 15.075 |
| 16 | `kimi-k2.7-code` | ChatAnywhere 优惠 / `kimi-k2.7-code` | 按页面分组 | 5.2 | 21.6 | 13.4 | 15.075 |
| 17 | `glm-5.2` | SiliconFlow / `zai-org/GLM-5.2` | 1M | 6.0 | 28.0 | 17 | 15.2667 |
| 17 | `glm-5.2` | ChatAnywhere 默认 / `glm-5.2` | 按页面分组 | 6.4 | 22.4 | 14.4 | 15.2667 |
| 17 | `glm-5.2` | ChatAnywhere 优惠 / `glm-5.2` | 按页面分组 | 6.4 | 22.4 | 14.4 | 15.2667 |
| 18 | `gemini-3.6-flash` | ChatAnywhere 默认 / `gemini-3.6-flash` | 按页面分组 | 6 | 30 | 18 | 18 |
| 18 | `gemini-3.6-flash` | ChatAnywhere 优惠 / `gemini-3.6-flash` | 按页面分组 | 6 | 30 | 18 | 18 |
| 19 | `claude-sonnet-5` | ChatAnywhere 默认 / `claude-sonnet-5` | 按页面分组 | 10 | 50 | 30 | 24 |
| 19 | `claude-sonnet-5` | ChatAnywhere 低价 / `claude-sonnet-5` | 按页面分组 | 4 | 20 | 12 | 24 |
| 19 | `claude-sonnet-5` | ChatAnywhere 优惠 / `claude-sonnet-5` | 按页面分组 | 10 | 50 | 30 | 24 |
| 20 | `gemini-3.5-flash` | ChatAnywhere 默认 / `gemini-3.5-flash` | 按页面分组 | 7.5 | 45 | 26.25 | 26.25 |
| 20 | `gemini-3.5-flash` | ChatAnywhere 优惠 / `gemini-3.5-flash` | 按页面分组 | 7.5 | 45 | 26.25 | 26.25 |
| 21 | `gemini-3.1-pro-preview` | ChatAnywhere 默认 / `gemini-3.1-pro-preview` | 按页面分组 | 8 | 48 | 28 | 28 |
| 21 | `gemini-3.1-pro-preview` | ChatAnywhere 优惠 / `gemini-3.1-pro-preview` | 按页面分组 | 8 | 48 | 28 | 28 |
| 22 | `gpt-5.4` | ChatAnywhere 默认 / `gpt-5.4` | 按页面分组 | 17.5 | 105 | 61.25 | 35 |
| 22 | `gpt-5.4` | ChatAnywhere 低价 / `gpt-5.4` | 按页面分组 | 2.5 | 15 | 8.75 | 35 |
| 22 | `gpt-5.4` | ChatAnywhere 优惠 / `gpt-5.4` | 按页面分组 | 10 | 60 | 35 | 35 |
| 23 | `claude-opus-5` | ChatAnywhere 默认 / `claude-opus-5` | 按页面分组 | 25 | 125 | 75 | 60 |
| 23 | `claude-opus-5` | ChatAnywhere 低价 / `claude-opus-5` | 按页面分组 | 10 | 50 | 30 | 60 |
| 23 | `claude-opus-5` | ChatAnywhere 优惠 / `claude-opus-5` | 按页面分组 | 25 | 125 | 75 | 60 |
| 24 | `claude-fable-5` | ChatAnywhere 默认 / `claude-fable-5` | 按页面分组 | 50 | 250 | 150 | 120 |
| 24 | `claude-fable-5` | ChatAnywhere 低价 / `claude-fable-5` | 按页面分组 | 20 | 100 | 60 | 120 |
| 24 | `claude-fable-5` | ChatAnywhere 优惠 / `claude-fable-5` | 按页面分组 | 50 | 250 | 150 | 120 |
| 25 | `hunyuan-mt-7b` | SiliconFlow / `tencent/Hunyuan-MT-7B` | 32K | 免费 | 免费 | 免费 | 免费 |

# 一些常用的prompts要求

期刊方面：
- 