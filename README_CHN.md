# 基于 CodeMender 与工作负载身份联合 (WIF) 的安全 CI/CD 实战包 (`lab/`)

本目录包含面向 **外部开发者、云安全架构师与 DevSecOps 工程师** 整理的自包含实战演练包，采用 **在线 GitHub Actions + Google Cloud 工作负载身份联合 (WIF)** 实操模式，涵盖完整步骤手册、未修复初始靶场源码（`starter-repo`）、全量加固参考源码（`remediated-repo`）、全套本地依赖包（`vendor`）以及深度漏洞修复报告。

> **适用对象**: 外部技术人员、客户安全架构师与研发团队  
> **演练模式**: 在线 GitHub Actions CI/CD 流水线 + Google Cloud WIF 实时联邦换票  
> **目标环境**: Google Cloud (`$PROJECT_ID`) 与 GitHub Actions  
> **双语对等文档**: [English Version (README.md)](README.md)

> [!IMPORTANT]
> **实验前置要求 — 提交 GCP Project ID 开通 CodeMender 预览白名单**：
> 在开始本实验前，**请参与者务必提前提交您用于实验的 Google Cloud 项目 ID（`$PROJECT_ID`）**，由我们协助为您申请并开通 **CodeMender 及底层 Vertex AI Interactions API (`gemini-3.7-flash`) 预览白名单权限**。请确认您的 GCP Project ID 白名单已生效后再执行 `cm find`、`cm verify` 与 `cm fix`。

---

## 📚 核心文档与报告导航索引

| 文档名称 | 英文原版 (English Version) | 中文同步版 (`_CHN.md`) | 内容说明 |
| :--- | :--- | :--- | :--- |
| **完整实战操作手册** | [CODELAB.md](CODELAB.md) | [CODELAB_CHN.md](CODELAB_CHN.md) | 端到端实操指南：Runner 拓扑决策矩阵、Workload Identity Pool 与 GitHub OIDC Provider 部署、`attribute.repository` 最小权限绑定、流水线 3 处 `FIXME` 补全、本地内环（`pre-commit` + 本地 Semgrep + `cm fix`）以及云端 GitHub Actions 外环自动 PR 验证。 |
| **架构与验证交付总结** | [LAB_SUMMARY.md](LAB_SUMMARY.md) | [LAB_SUMMARY_CHN.md](LAB_SUMMARY_CHN.md) | WIF + OIDC 无密钥换票时序图、双层左移流水线拓扑、核心工程排障铁律（`--bypass-warning`、纯数字 `PROJECT_NUMBER`、`git diff HEAD`）与资源清理指南。 |
| **全栈漏洞修复深度报告** | [REMEDIATION_REPORT.md](REMEDIATION_REPORT.md) | [REMEDIATION_REPORT_CHN.md](REMEDIATION_REPORT_CHN.md) | 覆盖 API 控制器、中间件、服务层、仓储层与底层工具类的全部 **16 项高危/严重安全漏洞** 的修复前根因、PoC 动态验真与修复后补丁详解。 |

---

## 📂 目录结构与本地资产清单

所有靶场模版仓库、Node.js `npm` 依赖包、Semgrep 静态扫描规则库以及 GitHub Actions 插件源码包均已打包至本地目录：

```text
lab/
├── README.md / README_CHN.md                        # 实验总览、白名单前置要求与目录导航索引
├── CODELAB.md / CODELAB_CHN.md                      # 完整实战操作手册（使用本地 starter-repo + 在线 GitHub Actions & GCP WIF）
├── LAB_SUMMARY.md / LAB_SUMMARY_CHN.md              # 架构时序、验证记录与排障指南
├── REMEDIATION_REPORT.md / REMEDIATION_REPORT_CHN.md# 全部 16 项安全漏洞与修复方案深度报告
├── starter-repo/                                    # [初始漏洞靶场仓库] 供实验者从零开始动手演练
│   ├── lab/
│   │   ├── hooks/ (install.sh, pre-commit)          # 本地 Git pre-commit 钩子（优先读取本地离线 Semgrep 规则）
│   │   ├── rules/p-javascript.yaml                  # 本地内置 Semgrep JavaScript 规则库 (210 KB)
│   │   ├── scripts/semgrep-to-cm.py                 # Semgrep JSON 转 CodeMender 导入格式脚本
│   │   ├── templates/codemender-pipeline.template.yaml # 含 3 处 FIXME 填空题的流水线练习模版
│   │   └── solutions/codemender-pipeline.solution.yaml # 流水线标准参考答案
│   ├── src/                                         # 含 16 处典型漏洞的 Node.js 电商 API 初始源码
│   ├── node_modules/                                # 预安装的完整本地 npm 依赖树（共 56 个包）
│   └── package.json
├── remediated-repo/                                 # [全量修复参考仓库] 全部 16 处漏洞已修复的参考实现
│   ├── .github/workflows/codemender-pipeline.yml    # 已补全并验证全绿的 WIF + CodeMender 生产级流水线
│   ├── src/                                         # 全面安全加固后的 Node.js 源码
│   └── node_modules/                                # 预安装的完整本地 npm 依赖树
└── vendor/                                          # [本地离线资源包] 归档的全部外部依赖与参考源码
    ├── codemender-wif-lab-starter.tar.gz            # starter-repo 完整独立压缩包
    ├── npm-offline-cache/                           # express@4.18.2 及其全部 55 个传递依赖的 .tgz 源码包
    ├── semgrep-rules/p-javascript.yaml              # Semgrep JavaScript 官方规则集离线镜像 (210 KB)
    ├── schemas/sarif-schema-2.1.0.json              # OASIS SARIF 2.1.0 标准 Schema 文件
    └── github-actions/                              # 流水线引用的全部 4 个 GitHub Actions 官方版本源码归档
        ├── actions-checkout-v4.tar.gz
        ├── actions-upload-artifact-v4.tar.gz
        ├── google-github-actions-auth-v2.tar.gz
        └── peter-evans-create-pull-request-v6.tar.gz
```
