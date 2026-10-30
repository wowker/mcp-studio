# 域文档

engineering skills 探索本仓库代码时应如何消费域文档。

## 探索前先读

- 根目录 **`GLOSSARY.md`**；或
- 若存在根目录 **`GLOSSARY-MAP.md`**，它指向每个上下文各自的 `GLOSSARY.md`，读取与当前主题相关的每一个。
- **`docs/decisions/`**：按编号读取与即将改动区域相关的决策记录（ADR）。本仓库的 ADR 目录是 `docs/decisions/`，不使用 `docs/adr/`。多上下文仓库还应检查 `src/<context>/docs/adr/` 下的上下文级决策。

若上述文件不存在，**静默继续**。不要提示其缺失，也不要主动建议预先创建。`/domain-modeling`（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 到达）会在术语或决策真正定稿时按需懒创建。

## 目录结构

单上下文仓库（绝大多数仓库，本仓库属于此类）：

```
/
├── GLOSSARY.md
├── docs/decisions/
│   ├── 001-m2-configuration-session.md
│   └── 002-m3-debug-record-contract.md
└── apps/ · internal/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 使用术语表词汇

输出中出现域概念时（issue 标题、重构提案、假设、测试名），使用 `GLOSSARY.md` 中定义的术语，不要漂移到术语表明确回避的同义词。

需要的概念尚未进入术语表，是信号：要么你在发明本项目并不使用的语言（重新考虑），要么确实存在缺口（记下来交给 `/domain-modeling`）。

## 指出 ADR 冲突

输出若与既有 ADR 矛盾，必须显式指出而非静默覆盖：

> _与 ADR-0007（event-sourced orders）冲突，但值得重开，因为……_
