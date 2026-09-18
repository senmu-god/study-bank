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

## 环境变量

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 默认 https://api.deepseek.com |
| `DEEPSEEK_MODEL` | 默认 deepseek-chat |
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_ANON_KEY` | 匿名 key（当前前端不直连，可留空） |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端专用 key，仅 API Route 使用，严禁暴露到前端 |

## 部署到 Vercel

1. 将本仓库推送到 GitHub：
   ```bash
   git init && git add . && git commit -m "init"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 在 Vercel 导入该 GitHub 仓库。
3. 在 Vercel 项目 Settings → Environment Variables 中填入上表全部变量。
4. 部署完成后通过 `https://<你的项目>.vercel.app` 访问。

## 功能流程

- `/knowledge` 知识点管理（树形浏览、筛选、批量打标签）
- `/knowledge/import` 批量导入（层级标记 / 路径分隔 / JSON 三种模式）
- `/generate` AI 出题（每日 60% 新知识点 + 40% 历史，并发 4，失败可重试）
- `/create-paper` 组卷（知识点百分比 + 题型比例 + 难度范围）
- `/exam/[paperId]` 在线答题（每题计时，简答题 AI 判分）
- `/results/[paperId]` 成绩解析 + 知识点得分率
- `/paper/[paperId]/preview` 试卷预览，导出 PDF（打印）/ Word
- `/wrong-answers` 错题本（SM-2 间隔复习：1/3/7/15/30 天）

## 安全说明

- 仅你一个人使用，所有数据库操作经 Next.js API Route 用 service_role key 完成，前端不直连数据库。
- 生产环境建议在 Supabase 中关闭 service_role 公网写权限，或开启 RLS 并仅允许 service_role 绕过。
