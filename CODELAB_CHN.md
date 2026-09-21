# 基于 CodeMender 与工作负载身份联合 (WIF) 的安全 CI/CD 实战指南

> **原文来源**: Google Cloud CodeMender & Workload Identity Federation (WIF) Hands-On Lab  
> **演练主题**: GitHub Actions 无密钥工作负载身份联合 (WIF) 与 CodeMender 自主安全修复流水线  
> **目标环境**: Google Cloud (`$PROJECT_ID`) 与 GitHub Actions  
> **双语对等文档**: [English Version (CODELAB.md)](CODELAB.md)

---

## 1. 实验导论与核心背景

在代码仓库或 CI/CD 机密配置中硬编码 Service Account (SA) 的明文 JSON 私钥凭据，是企业级云安全最严重的攻击面之一。一旦工程师不慎将密钥提交到公开仓库，或者 CI/CD 变量遭到泄露，攻击者就能立刻接管整个 Google Cloud 环境。**工作负载身份联合 (Workload Identity Federation, WIF)** 彻底消除了对静态长效私钥的依赖。

在本实战演练中，你将构建 GitHub Actions 与 Google Cloud 之间的 **WIF 零信任联合信任链**，随后编写并补全一条集成了 **CodeMender（企业级自主安全智能体）** 的自动化 CI/CD 流水线，针对存在典型漏洞的 Node.js 应用程序执行本地与云端双环检测与自动化代码修复。

> [!NOTE]
> **这是一个实操构建演练，而非无脑复制粘贴的实验。** 大多数步骤给出了构建目标、参数规范与验证命令，但需要你理解每个云原生资源存在的原因。

### 你将完成的任务：
- 评估不同 CI/CD Runner 拓扑架构是否真正需要 WIF。
- 基于模版创建并初始化 GitHub 练习仓库。
- 创建全局工作负载身份池（Workload Identity Pool）与严格限定当前仓库的 GitHub OIDC 提供方（Provider）。
- 配置属性映射（Attribute Mapping）与属性条件（Attribute Condition），彻底防御“糊涂侍从（Confused Deputy）”攻击。
- **补全 GitHub Actions 流水线中的三大缺失要素（FIXME）**：补齐 OIDC 令牌生成权限与 CodeMender 自动化运行参数。
- 运行 **内环（Inner Loop）**：本地 Semgrep 静态代码分析与 CodeMender 本地精准修复。
- 验证 **外环（Outer Loop）**：无密钥 WIF 凭据兑换、深度语义漏洞扫描、自动拉取 PR 与安全门禁拦截。

### 前置准备要求：
- **一个已完成 CodeMender 预览白名单注册的 Google Cloud 项目**：请提前提交您的 `GCP Project ID`，由我们协助为您开通 CodeMender 及 Vertex AI Interactions API (`gemini-3.7-flash`) 预览白名单权限。
- 一个个人的 GitHub 账号。
- 基础的 Bash 脚本、YAML 与 GitHub Actions 操作经验。

---

## 2. 架构决策：你的 CI/CD Runner 真正需要 WIF 吗？

并非所有 CI/CD Runner 都需要配置 WIF。盲目引入 WIF 会带来不必要的配置与维护成本。在设计架构时，必须先回答一个核心问题：*Runner 运行在何处？它是否已经天然具备了 Google Cloud 身份？*

### 常见的三大 Runner 拓扑架构对比

| Runner 拓扑类型 | 物理运行位置 | 获取 GCP 凭据的方式 | 是否需要配置 WIF？ |
| :--- | :--- | :--- | :--- |
| **自托管在企业自身的 Google Cloud 基础设施上** (GCE VM, GKE 节点, Cloud Run 任务) | 运行在你的 Google Cloud 项目内 | 绑定的 Service Account 通过元数据服务器直接提供应用默认凭据 (ADC) | **不需要。** 该工作负载在云内已天然具备 GCP 身份。 |
| **自托管在本地数据中心或其他公有云上** | 运行在 Google Cloud 外部，由企业自控的基础设施上 | WIF 联合身份，或静态 SA JSON 密钥文件 | **需要。** 使用 WIF 替代高危的静态私钥文件。 |
| **由 CI/CD 厂商托管的托管型 Runner** (GitHub-hosted, GitLab SaaS, GitHub Enterprise Cloud 托管 Runner) | 运行在 CI/CD 厂商拥有的临时容器/虚拟机上 | 无 Google Cloud 身份；由厂商颁发签名的 OIDC ID 令牌 | **非常需要。这是 WIF 最核心的杀手级应用场景。** |

### 为什么托管型 Runner 场景最为关键？

许多大型企业客户使用 **GitHub Enterprise Cloud** 或 **GitLab Dedicated** 并配置了“托管私有 Runner”。这些 Runner：
- 具有临时性（Ephemeral）：每次作业销毁重建，无法预先安装持久凭据。
- 虽然可以通过网络专线连接客户内部 VPC，看似是“私有”的。
- 但从身份视角来看，它们属于 CI/CD 厂商，**在 Google Cloud IAM 中完全没有合法的安全主体身份**。

在过去，开发者唯一的做法就是在 GitHub Secrets 里塞一个 SA JSON 密钥。但**网络隔离只控制了“流量从哪里来”，WIF 控制的则是“调用方是谁”**。托管型 Runner 无论网络如何隔离，依然必须通过 WIF 将短效 OIDC 令牌兑换为有范围限制的短效 GCP Access Token。

---

## 3. 实验环境初始化与参数准备

> [!WARNING]
> **前置白名单确认**：在运行本实验前，请确保您已提前提交您的 `GCP Project ID` 并已完成 **CodeMender 预览白名单（Preview Allowlist）** 开通。实验采用 **在线 GitHub Actions + Google Cloud WIF** 实操模式，未加入白名单的 GCP 项目在调用底层 `gemini-3.7-flash` 模型时将返回权限拒绝报错。

在 Cloud Shell 或本地开发终端中导出核心环境变量：

```bash
export PROJECT_ID="<YOUR_PROJECT_ID_HERE>"
gcloud config set project ${PROJECT_ID}

# 动态获取数字型 Project Number，严禁手动输入
export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")

echo "Active Project ID:     ${PROJECT_ID}"
echo "Active Project Number: ${PROJECT_NUMBER}"
```
> **架构要点**：IAM 策略绑定使用文本形式的 **Project ID**；而 WIF 的 `principalSet://` URI 必须使用纯数字形式的 **Project Number**。混淆这两者是 WIF 绑定失败最常见的原因。

参照 [官方安装与环境配置指南](https://docs.cloud.google.com/gemini-enterprise-agent-platform/codemender/set-up-environment) 下载并验证 CodeMender CLI (`cm`) 工具链：
```bash
curl -L -o cm-linux-amd64.zip "https://artifactregistry.googleapis.com/download/v1/projects/cmoc-prod/locations/us/repositories/codemender-cli-production/files/cm%3Astable%3Acm-linux-amd64.zip:download?alt=media"
unzip -q -o cm-linux-amd64.zip
chmod +x cm
sudo mv cm /usr/local/bin/cm
rm -f cm-linux-amd64.zip

cm --version
cm init
```

---

## 4. 初始化 GitHub 实验工作区

练习模版仓库中包含存在漏洞的 Node.js 应用程序、Semgrep 工具集以及一份**流水线模版**。初始状态下流水线未放入 `.github/workflows/`，且预留了 3 处关键空缺等待你补全。

### 1. 登录并认证 GitHub CLI
```bash
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
```
1. 复制终端输出的一次性配对码（例如 `A1B2-C3D4`）。
2. 在浏览器中打开 [https://github.com/login/device](https://github.com/login/device) 并授权。
3. 当终端提示 **Authenticate Git with your GitHub credentials?** 时，输入 **Yes**。

验证登录状态与权限：
```bash
gh auth status
```
确认 **Token scopes** 中包含 `workflow`（若缺少该 scope，后续推送 `.github/workflows/` 目录将被 GitHub 强行拒绝）。

### 2. 基于模版创建个人实验仓库并克隆
```bash
# 使用本地已打包的 starter-repo 初始化并推送至你的个人 GitHub 仓库
cp -r ./starter-repo ./codemender-wif-lab
cd codemender-wif-lab
git init -b main
git add .
git commit -m "chore: initial starter template"
gh repo create codemender-wif-lab --public --source=. --remote=origin --push
```

### 3. 授予 GitHub Actions 创建与审批 PR 的权限
CodeMender 在发现并修复漏洞后会自动提交 Pull Request。需要将仓库的工作流权限配置为 **write**，并允许创建/审批 PR：
```bash
gh api -X PUT /repos/{owner}/{repo}/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```
*(亦可在网页端进入 `Settings > Actions > General > Workflow permissions` 配置)*。

验证配置生效：
```bash
gh api /repos/{owner}/{repo}/actions/permissions/workflow
```
预期输出：
```json
{
  "default_workflow_permissions": "write",
  "can_approve_pull_request_reviews": true
}
```
> [!IMPORTANT]
> `can_approve_pull_request_reviews` 默认是 `false`。如果不开启，流水线前几步都能跑通，但在最后一步会报错崩溃：`GitHub Actions is not permitted to create or approve pull requests`。

---

## 5. 启用 Google Cloud 相关服务 API

导出 GitHub 身份变量（注意大小写敏感）：
```bash
export GITHUB_USERNAME=$(gh api user --jq .login)
export GITHUB_REPO="codemender-wif-lab"
export GITHUB_REPO_FULL="${GITHUB_USERNAME}/${GITHUB_REPO}"

export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

echo "GitHub repo:    ${GITHUB_REPO_FULL}"
echo "Project ID:     ${PROJECT_ID}"
echo "Project Number: ${PROJECT_NUMBER}"
```

批量启用 5 大核心服务 API：
```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  aiplatform.googleapis.com \
  serviceusage.googleapis.com
```

| API 服务名称 | 缺失该 API 会导致什么报错 |
| :--- | :--- |
| `iam.googleapis.com` | 无法创建 Workload Identity Pool、Provider 或服务账号 |
| `iamcredentials.googleapis.com` | OIDC 令牌兑换失败（无法生成 GCP 短效 Access Token） |
| `cloudresourcemanager.googleapis.com` | 项目级 IAM 策略绑定失败 |
| `aiplatform.googleapis.com` | CodeMender 无法调用底层 Gemini 模型推理 |
| `serviceusage.googleapis.com` | 项目级 API 配额计算与计费关联失败 |

---

## 6. 构建 Workload Identity Pool 与 OIDC Provider

### 任务 A：创建工作负载身份池 (Pool)
- **Pool ID**: `github-actions`
- **Location**: `global`
- **Display Name**: `GitHub Actions Pool`

```bash
gcloud iam workload-identity-pools create github-actions \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="${PROJECT_ID}"
```

### 任务 B：向身份池中添加 GitHub OIDC Provider
- **Provider ID**: `github-oidc`
- **Parent Pool**: `github-actions`
- **Issuer URI**: `https://token.actions.githubusercontent.com`
- **属性映射 (Attribute Mapping)**:
  - `google.subject` = `assertion.sub`
  - `attribute.repository` = `assertion.repository`
- **属性条件 (Attribute Condition)**: `assertion.repository_owner == '${GITHUB_USERNAME}'`

```bash
gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_USERNAME}'" \
  --project="${PROJECT_ID}"
```

> **为什么必须同时配置 Mapping 和 Condition？** 全球所有 GitHub 用户共享同一个签发端点 `token.actions.githubusercontent.com`。如果没有 Condition，全球任意一个 GitHub 仓库跑 Actions 都能拿着有效 Token 叩开你的身份池大门。`repository_owner` 是第一道防线；`attribute.repository` 则在 IAM 层级锁定了只能由具体某一个代码仓库进行冒用。

验证 Provider 配置：
```bash
gcloud iam workload-identity-pools providers describe github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --project="${PROJECT_ID}"
```

---

## 7. 预配最小权限服务账号与精准联合绑定

### 任务 A：创建专用的 CI 服务账号
- **Account ID**: `codemender-ci`
- **Display Name**: `CodeMender CI Runner`

```bash
gcloud iam service-accounts create codemender-ci \
  --display-name="CodeMender CI Runner" \
  --project="${PROJECT_ID}"
```

### 任务 B：授予 CodeMender 所需的两个项目级最小角色
1. `roles/aiplatform.user`：允许调用 Vertex AI / Gemini 模型
2. `roles/serviceusage.serviceUsageConsumer`：允许消耗当前项目的配额

```bash
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

### 任务 C：将 GitHub 联合身份绑定到 Service Account
在 `codemender-ci` 服务账号资源级别（**绝不要在项目级**）授予 `roles/iam.workloadIdentityUser`，并精确限制在当前仓库的 `attribute.repository`：

```bash
gcloud iam service-accounts add-iam-policy-binding \
  codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/attribute.repository/${GITHUB_REPO_FULL}"
```

> [!CAUTION]
> **绝对不要绑定到整个 Pool (`.../workloadIdentityPools/github-actions/*`)**！否则你名下的任何其他 Fork 或测试仓库都可以直接冒用该服务账号。

验证绑定策略：
```bash
gcloud iam service-accounts get-iam-policy \
  codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com
```

---

## 8. 配置 GitHub Actions 仓库级变量

在 GitHub 仓库中配置 3 个非敏感的环境变量（Variables，无需配置为 Secrets）：
1. `GCP_WIF_PROVIDER`：OIDC Provider 的完整资源路径
2. `GCP_SA_EMAIL`：`codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com`
3. `GCP_QUOTA_PROJECT`：`${PROJECT_ID}`

```bash
WIF_PROVIDER_NAME=$(gcloud iam workload-identity-pools providers describe github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --project="${PROJECT_ID}" \
  --format="value(name)")

gh variable set GCP_WIF_PROVIDER --body "${WIF_PROVIDER_NAME}"
gh variable set GCP_SA_EMAIL --body "codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com"
gh variable set GCP_QUOTA_PROJECT --body "${PROJECT_ID}"
```

验证变量就绪：
```bash
gh variable list
```

---

## 9. 补全 CodeMender CI/CD 流水线

将模版移动到生效路径：
```bash
mkdir -p .github/workflows
cp lab/templates/codemender-pipeline.template.yaml .github/workflows/codemender-pipeline.yml
```

编辑 `.github/workflows/codemender-pipeline.yml` 并补齐 3 处空缺：

### FIXME 1：补齐 OIDC Token 生成权限
在顶部的 `permissions:` 块中添加 `id-token: write`：
```yaml
permissions:
  contents: write          # 允许推送修复分支
  pull-requests: write     # 允许自主创建修复 PR
  id-token: write          # 允许生成 GitHub OIDC Token 用于换取 GCP 凭据
```

### FIXME 2：补齐 CodeMender 自主扫描参数
在 `CodeMender Scan` 步骤中，将 `FLAGS_GO_HERE` 替换为 `-y --model "$CM_MODEL"`：
```yaml
      - name: CodeMender Scan
        id: scan
        run: |
          cm find "$SCAN_PATH" --sandbox=false -y --model "$CM_MODEL" 2>&1 | tee "$RUNNER_TEMP/cm-find.cm.log"
```

### FIXME 3：补齐 CodeMender 自主修复与验真参数
在 `Verify and Remediate` 循环中，将 `cm fix` 行的 `FLAGS_GO_HERE` 替换为 `-y --bypass-warning --model "$CM_MODEL"`：
```yaml
            yes | cm fix "$FID" --sandbox=false -y --bypass-warning --model "$CM_MODEL" 2>&1 | tee "$RUNNER_TEMP/fix-$FID.cm.log" || true
```

### CodeMender 核心命令与参数对照表

| 命令 / 参数 | 核心作用与行为 | 何时必须使用 |
| :--- | :--- | :--- |
| `cm init` | 初始化 `.codemender/` 工作区与本地漏洞 SQLite 数据库 | 流水线初始化时 |
| `cm find <path>` | 对指定目录运行智能体语义扫描并记录 Findings | 静态只读扫描步骤 |
| `cm verify <id>` | 智能体在 `.exploit/` 自动生成并执行真实 Exploit PoC 验真漏洞 | 修复前验真步骤 |
| `cm fix <id>` | 针对已确认的漏洞生成代码修复补丁 | 自动修复步骤 |
| `-y` | 自动确认单步交互提示 | CI 非交互环境必备 |
| `--bypass-warning` | 显式声明知晓智能体拥有执行命令与修改文件的权限 | **`cm verify` 与 `cm fix` 在 CI 中强制必备（`-y` 无法替代它）** |
| `--sandbox=false` | 规避 Ubuntu 24.04+ 对非特权网络命名空间 `sbox` 的限制，同时保留 `project_paths` 目录边界 | Cloud Shell 与 GitHub Actions `ubuntu-latest` 环境推荐 |
| `--model <name>` | 指定 Gemini 模型（如 `gemini-3.7-flash`） | 保证每次扫描与修复的延迟与质量一致 |

### 校验与本地提交
```bash
# 验证 YAML 语法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/codemender-pipeline.yml')); print('YAML OK')"

# 检查 3 处空缺是否全部修复（忽略 YAML 注释行）
if grep -v '^[[:space:]]*#' .github/workflows/codemender-pipeline.yml | grep -q "FLAGS_GO_HERE"; then
  echo "FLAGS_GO_HERE 占位符仍存在"
elif ! grep -q "id-token: write" .github/workflows/codemender-pipeline.yml; then
  echo "缺少 id-token: write 权限"
else
  echo "流水线 3 处空缺全部修复成功"
fi

# 提交流水线（先不要 push）
git add .github/workflows/codemender-pipeline.yml
git commit -m "ci: add CodeMender security guardrail pipeline"
```

---

## 10. 本地安全左移实践（内环：Inner Loop）

在将代码推送到远程触发 CI 之前，先演练开发者如何在本地工作站快速排查并修复高危漏洞。

1. **安装 Semgrep 并激活 Git pre-commit 钩子**：
   ```bash
   pip install --quiet semgrep
   ./lab/hooks/install.sh
   ```

2. **配置 CodeMender 本地沙盒范围**：
   ```bash
   cm init || true
   
   for CONFIG in "$HOME/.codemender/config.yaml" "$(pwd)/.codemender/config.yaml"; do
     mkdir -p "$(dirname "$CONFIG")"
     touch "$CONFIG"
     if ! grep -q '^project_paths:' "$CONFIG" 2>/dev/null; then
       printf '\nproject_paths:\n  - "%s"\n' "$(pwd)" >> "$CONFIG"
     fi
     sed -i 's/type: ""/type: "git"/' "$CONFIG" 2>/dev/null || true
     if ! grep -q 'type: "git"' "$CONFIG" 2>/dev/null && ! grep -q 'type: git' "$CONFIG" 2>/dev/null; then
       printf '\nvcs:\n  type: git\n' >> "$CONFIG"
     fi
     if ! grep -q '  - lab' "$CONFIG" 2>/dev/null; then
       sed -i 's/  - node_modules/  - node_modules\n  - lab\n  - .github/' "$CONFIG" 2>/dev/null || true
     fi
   done
   ```

3. **运行 Semgrep 本地快速静态扫描并转换格式**：
   ```bash
   semgrep scan --config=lab/rules/p-javascript.yaml --json -o /tmp/semgrep.json src/
   python3 lab/scripts/semgrep-to-cm.py /tmp/semgrep.json -o /tmp/cm-findings.json
   ```

4. **导入并查看漏洞报告**：
   ```bash
   cm report import -f /tmp/cm-findings.json -p .
   cm report
   ```
   扫描发现 2 个漏洞：
   - `src/api/controllers/admin.controller.js` (HIGH 严重级：动态 `eval` 远程代码执行)
   - `src/api/controllers/order.controller.js` (MEDIUM 严重级：`res.sendFile` 路径遍历)

5. **仅修复 HIGH 高危漏洞（故意保留 MEDIUM 用于外环验证）**：
   ```bash
   yes | cm fix <HIGH_FINDING_ID> -y --bypass-warning --sandbox=false \
     --context "Focus on src/api/controllers/admin.controller.js. Fix the dynamic eval by validating or parsing the expression."
   
   git add src/api/controllers/admin.controller.js
   git commit -m "fix(security): sanitize dynamic eval in admin.controller.js"
   ```

6. **本地验证并推送到 GitHub 触发外环 CI**：
   ```bash
   semgrep scan --config=lab/rules/p-javascript.yaml src/
   # 此时仅剩 1 个 MEDIUM 漏洞，HIGH 漏洞已被成功修复
   
   cm stats </dev/null
   git push origin main
   ```

---

## 11. 验证云端自动化 CI/CD 流水线（外环：Outer Loop）

进入 GitHub 仓库的 **Actions** 页面，查看刚刚触发的流水线运行日志：

1. **Authenticate to Google Cloud**：检查 WIF 换票流程，验证 OIDC Token 成功兑换为短效 GCP 凭据（全程零静态 JSON 私钥）。
2. **Install CodeMender CLI**：从 Google Cloud 官方 Artifact Registry 端点自动下载并安装最新稳定版 CLI。
3. **CodeMender Scan**：智能体对 `src/services/` 进行深入语义扫描，找出 AST 语法扫描无法发现的深层缺陷（如 `admin.service.js` 的 RCE、`catalog.service.js` 的 SSRF 以及 `checkout.service.js` 的 TOCTOU 条件竞争）。
4. **Verify and Remediate**：智能体编写实测 PoC 脚本执行利用，返回 `VERIFIED` 并生成修复补丁。
5. **Pull Request**：自动创建标题为 *CodeMender: autonomous security remediation* 的 Pull Request。
6. **Security Gate**：由于项目中依然存在未合入的 HIGH/CRITICAL 漏洞，安全门禁按设计成功阻断（Fail），防止带病构建。
7. **HTML Report Artifact**：下载生成的 `codemender-html-report.zip` 解压查看可视化安全审计报告。

### 常见故障排查表

| 报错现象 | 最可能的原因 | 解决方案 |
| :--- | :--- | :--- |
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | `permissions:` 块中缺少 `id-token: write` | 在流水线顶部添加 `id-token: write` 权限 |
| `Permission denied on resource ... workloadIdentityPools` | `principalSet://` URI 错误地使用了 Project ID | 必须改为纯数字的 `${PROJECT_NUMBER}` |
| `The caller does not have permission` on SA | `roles/iam.workloadIdentityUser` 绑错在项目级别或池级别 | 必须直接绑定在 `codemender-ci` 服务的单个 SA 资源上 |
| 换票时报 `unauthorized_client` | 属性条件不匹配（通常是 GitHub 用户名大小写不符） | 严格校准 `assertion.repository_owner == '${GITHUB_USERNAME}'` 的大小写 |
| `GitHub Actions is not permitted to create or approve PRs` | 仓库的 `can_approve_pull_request_reviews` 为 `false` | 执行 `gh api -X PUT /repos/.../actions/permissions/workflow -F can_approve_pull_request_reviews=true` |
| 提示 `warning not acknowledged. Please run interactively once...` | `cm verify` 或 `cm fix` 漏加了 `--bypass-warning` | 补充 `--bypass-warning` 参数（`-y` 无法自动同意该安全告警） |

---

## 12. 实验资源清理

演练结束后，清理云端资源避免持续计费：
```bash
# 删除 WIF 身份池（自动连带清理其内部的 OIDC Provider）
gcloud iam workload-identity-pools delete github-actions \
  --location="global" \
  --project="${PROJECT_ID}" \
  --quiet

# 删除专用 CI 服务账号
gcloud iam service-accounts delete codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com \
  --project="${PROJECT_ID}" \
  --quiet
```
*(注：Workload Identity Pool 删除后有 30 天软删除保留期，30 天内可执行 `undelete` 恢复或换用新的 Pool ID)*。
