# 个人智能题库与组卷系统

自用的 AI 题库系统：导入知识点 → DeepSeek 自动出题 → 按知识点百分比组卷 → 在线答题判分 → 错题间隔复习 → 导出 PDF / Word。

## 技术栈

- Next.js 14（App Router）+ TypeScript
- Tailwind CSS + shadcn 风格组件
- Supabase（PostgreSQL）
- DeepSeek API（OpenAI 兼容协议）
- 导出：前端打印 CSS 生成 PDF，`docx` 生成 Word

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制 .env.example 填入你自己的值）
cp .env.example .env.local

# 3. 在 Supabase SQL Editor 中执行 supabase/schema.sql 建表

# 4. 启动
npm run dev
```

访问 http://localhost:3000

## 一键启动（Windows，推荐）

| 文件 | 作用 |
|---|---|
| `题库启动器.vbs` | 平时用这个（桌面快捷方式 `启动器\启动题库.lnk` 指向它）：隐藏窗口启动服务，等页面真正能打开后自动弹出浏览器 |
| `启动题库.bat` | 同上，但保留一个最小化的服务窗口，方便看日志、排查问题 |
| `停止题库.bat` | 停止服务（只结束占用 3000 端口的 node 进程） |

启动器（`start-bank.ps1`）做的事：

1. 服务已经在跑 → 直接开页面，不会重复起进程；
2. 有可用的生产构建且没过期 → 用 `next start`；否则自动用 `next dev`（不需要先 build，不会再"启动即退出"）；
3. 生产模式万一启动失败，会自动退回 dev 模式重试；
4. 等在 `http://localhost:3000/login` 上能拿到正常响应后再打开浏览器；
5. 全程写入 `启动日志.txt`，服务输出写入 `服务器输出.txt` / `服务器错误.txt`，失败会弹窗提示。

> 之前"每次打开都提示无法访问此网站"的原因：`启动题库.bat` 跑的是 `npm run start`，
> 而 `npm run start` 必须有生产构建（`.next\BUILD_ID`）。项目里 `.next` 只是 `next dev` 的产物，
> 没有 BUILD_ID，`next start` 会立刻报错退出；VBS 又是隐藏窗口运行，看不到报错，
> 于是浏览器就只剩"无法访问此网站"。现在启动器自动避开这个坑。

想要更快的页面加载（生产模式）：在项目目录执行一次 `npm run build`，之后启动器会自动优先用生产模式；
改了 `src` 里的代码后，启动器检测到构建过期会自动回到 dev 模式。

> 注意：服务已经在运行时，启动器不会重启它（只会打开浏览器）。改了代码想生效，
> 先双击 `停止题库.bat`，再双击启动器。

## 环境变量

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 默认 https://api.deepseek.com |
| `DEEPSEEK_MODEL` | 默认 deepseek-chat |
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_ANON_KEY` | 匿名 key（当前前端不直连，可留空） |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端专用 key，仅 API Route 使用，严禁暴露到前端 |

## 部署到现有 Vercel 项目

本项目已有 Git 仓库和远端地址。不要重新执行 `git init`、更换远端或直接覆盖生产分支。先备份 Supabase 数据，再确认待发布提交通过本地生产构建；推送到 GitHub 后，由已绑定的 Vercel 项目构建并部署。

在 Vercel 项目 Settings → Environment Variables 中配置：

| 变量 | 用途 | 必需性 |
|---|---|---|
| `SITE_ACCESS_PASSWORD` | 个人站点登录密码；生产环境未设置时应用会拒绝访问 | **Production 必需** |
| `SUPABASE_URL` | Supabase 项目地址 | 必需 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端数据库访问；不得放入前端变量 | 必需 |
| `DEEPSEEK_API_KEY` | 服务端 AI 诊断与出题 | 使用 AI 时必需 |
| `DEEPSEEK_BASE_URL` | AI 接口地址 | 可选，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | AI 模型 | 可选，默认 `deepseek-chat` |

密码和服务端密钥只填写在 Vercel 环境变量中，不要提交到 Git、写入客户端变量或粘贴到代码。只给 Production 环境配置生产密钥；如需 Preview 部署，应另外决定是否使用独立的测试凭据。修改环境变量后需重新部署。部署后确认未登录时会跳转登录页，登录后再检查首页、题库、学习中心和 `/data` 备份恢复入口。

## 功能流程

- `/knowledge` 知识点管理（树形浏览、筛选、批量打标签）
- `/knowledge/import` 批量导入（层级标记 / 路径分隔 / JSON 三种模式）
- `/generate` AI 出题（每日 60% 新知识点 + 40% 历史，并发 4，失败可重试）
- `/create-paper` 组卷（知识点百分比 + 题型比例 + 难度范围）
- `/exam/[paperId]` 在线答题（每题计时，简答题 AI 判分）
- `/results/[paperId]` 成绩解析 + 知识点得分率
- `/paper/[paperId]/preview` 试卷预览，导出 PDF（打印）/ Word
- `/wrong-answers` 错题本（SM-2 间隔复习：1/3/7/15/30 天）

## 知识漏洞闭环

- `/` 与 `/knowledge-graph` 使用题库 `knowledge_points` 作为唯一知识点来源；知识树不另建重复目录。
- `/learning?tab=gaps` 查看知识点状态与漏洞；`mode=teach&kp=<id>` 可启动逐步互动教学。
- `/learning?tab=tests` 按知识点调用专项组卷；答题后复用原有考试、判分和错题链路。
- 专项测试单次高分只进入「待确认」。两次使用不同题目、包含中等或更高难度题、均声明独立完成且正确率达到 80% 后，才自动确认为「已掌握」；系统优先避开最近三次测试用过的题。
- `/learning?tab=records` 查看诊断、教学、测试和状态变更记录；`/learning?tab=notes` 管理并关联知识点或题目的笔记。
- `/plan` 查看每日学习任务，`/data` 检查新表状态并导出备份。
- 完整 JSON 备份包含答题图片对象（最多 60 MB），还原时先恢复私有存储对象，再以单事务合并数据库数据；缺少图片文件的旧备份不会静默恢复失效引用。

当前连接的 Supabase 项目已应用下列 8 条迁移，迁移历史已记录为对应文件名前的版本号。不要在该项目的 SQL Editor 里重复粘贴执行。迁移前备份保存在 `C:\Users\0105\Documents\Codex\study-bank-backups`。

新建数据库时，在完成 `supabase/schema.sql` 后按版本号顺序执行：

1. `supabase/migrations/20261021123746_kp_loop.sql`：创建知识状态、诊断、教学、测试、任务和笔记表。
2. `supabase/migrations/20261021123818_answer_ai_score.sql`：保存简答题 AI 分数和评语。
3. `supabase/migrations/20261021123821_preserve_kp_history.sql`：阻止删除知识点时级联删除历史记录。
4. `supabase/migrations/20261021123825_import_kgm_backup.sql`：创建旧站备份导入能力。导入时在 `/data` 选择「知识就是力量」导出的 JSON，逐个确认映射或跳过后再提交。重复提交同一份备份不会重复写入；旧题只作为资料笔记导入，不会变成考试题。
5. `supabase/migrations/20261021123828_publish_question_draft.sql`：为 AI 补充题提供原子写入函数。只有 AI 结构检查通过且你逐题确认后，候选题才进入正式题库。
6. `supabase/migrations/20261021123841_restore_backup.sql`：为完整题库备份提供单事务、只新增不覆盖的合并还原。还原入口在 `/data`。
7. `supabase/migrations/20261021123845_save_question_concepts.sql`：让题目编辑页可以修正主知识点并添加/移除次要知识点关联。
8. `supabase/migrations/20261021123856_kp_progress_snapshots.sql`：启用首页每日真实进度快照与趋势图。

旧站在云端时，可先登录「知识就是力量」，然后在同一浏览器打开其 `/api/export` 地址下载 JSON 备份。该导出包含知识点、题目、证据、学习记录和设置，不包含 AI 密钥。下载后在本项目 `/data` 的旧站导入区完成逐项映射；不要把旧站数据库密钥放进导出文件。

执行新数据库迁移前先从 `/data` 下载备份。回滚脚本保存在 `supabase/rollback/`，不会被迁移工具自动执行。回滚 `0004` 会恢复级联删除行为；`0005` 至 `0008` 的回滚只移除对应 RPC，不会清除已经导入的数据；回滚 `0009` 会删除每日进度快照。涉及学习记录的迁移回滚前应先确认并单独备份。

## 安全说明

- 仅你一个人使用，所有数据库操作经 Next.js API Route 用 service_role key 完成，前端不直连数据库。
- 生产环境建议在 Supabase 中关闭 service_role 公网写权限，或开启 RLS 并仅允许 service_role 绕过。
