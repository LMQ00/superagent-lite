# Diagram 003: memory system

Raw reference diagram supplied by the user (`tmp/新记忆模块.drawio.png`). It is preserved here as the source for the memory design; [001 Domain model](../001-domain.md), [002 Rules](../002-rules.md), [003 Lifecycle](../003-lifecycle.md), [004 Configuration](../004-config-prompts.md), [006 Deployment](../006-deployment.md) and [007 Architecture](../007-architecture.md) implement and explain it.

```mermaid
flowchart TB
  U["用户需求"] --> R["router 发布任务"]
  R --> G["全局记忆<br/>共享 skill · 用户画像"]
  G --> P1["项目 1"]
  G --> P2["项目 2"]
  P1 --> PM1["项目记忆 1<br/>职责 · 定位 · 项目 skill · 知识库"]
  P2 --> PM2["项目记忆 2<br/>职责 · 定位 · 项目 skill · 知识库"]
  PM1 -->|注入项目 + 全局| W1["worker 角色"]
  PM1 -->|审查时注入项目 + 全局| V1["review 角色"]
  PM2 -->|注入项目 + 全局| W2["worker 角色"]
  PM2 -->|审查时注入项目 + 全局| V2["review 角色"]
  W1 -->|审查| V1
  W2 -->|审查| V2
  W1 --> A1["worker 原始会话记录"]
  W2 --> A2["worker 原始会话记录"]
  A1 -->|读取| M1["memory 角色"]
  A2 -->|读取| M2["memory 角色"]
  M1 -->|总结| PM1
  M2 -->|总结| PM2
  A1 --> AR["归档处"]
  A2 --> AR
```

## Rules carried by the diagram

| Part | Meaning |
| --- | --- |
| Global layer | Shared by every project: one shared skill and the user profile. |
| Project layer | Separate for each project: responsibilities, positioning, memory-registered project skills, and the project knowledge base. |
| Router injection | Only the global layer. |
| Worker and reviewer injection | The project layer plus the global layer. Responsibilities and positioning are injected directly. |
| Skills | Stored as normal skill files; only their descriptions enter the skill catalog, and the full body loads only through the `skill` tool. |
| Knowledge base | Reached only through query and write tools; only the memory role may use the write tool. |
| Raw conversation | The worker's original conversation is retained and archived. |
| Memory role | The `memory` role reads the raw worker conversation, summarizes it, and writes the project layer and global memory. |

## Implementation mapping

| Diagram part | Code |
| --- | --- |
| Global memory | `memory/global.json`, field `userProfile` (`src/memory-store.js`) |
| Project memory | `memory/projects/<sha256(projectRoot)>.json`, fields `responsibilities` and `positioning` (`src/memory-store.js`) |
| Shared skill | `~/.agents/skills/superagent-shared-memory/SKILL.md`; description only in the skill catalog |
| Project skill | `<projectRoot>/.dsh/skills/superagent-project-memory/SKILL.md`; a worker-scoped provider reads it from the project checkout so the Worktree worker and reviewer see its description in the skill catalog. Any skill memory writes under the global or project skill root is registered as memory-owned for catalog stability |
| Knowledge base | `memory/knowledge/<sha256(projectRoot)>.json`, queried and edited through `knowledge_query` and `knowledge_write` (`src/memory-store.js`, `src/memory.js`) |
| Router injection | `refreshGlobalMemory` / `registerGlobalMemoryContext` (`src/memory.js`, `router.js`) |
| Worker injection | `registerMemoryContext` reads project + global memory at Worker creation (`src/memory.js`, `index.js`) |
| Reviewer injection | `memoryPromptForProject` is added to the review prompt on every review (`src/memory.js`, `src/review.js`) |
| Raw conversation | `workerConversation` builds the transcript from the Worker Session (`src/memory.js`) |
| Memory role | `memoryRole` / `memoryPrompt`, label `Distill memory`, depth 2, read-only helper with the knowledge query and write tools (`src/memory.js`, `index.js`) |
| Summary write | `runMemoryExtraction` writes only non-empty changed fields and changed skills (`src/memory.js`) |
| Archive | `archiveWorkerTurn` writes each turn under `task/archive/` (`src/memory.js`) |

## Rules

- Global memory is shared by every project; project memory and project knowledge are keyed by the normalized project root and never cross projects.
- Router sees only global memory. The router preset restricts its skill roots to the global skill roots; the worker preset keeps project and global skill roots.
- Worker and reviewer prompts receive the project and global memory text. Responsibilities and positioning are injected directly; skills only contribute their descriptions to the catalog.
- A running or finished session keeps the catalog it published: catalog changes caused only by memory-owned skills are withheld, and changes involving any other skill are delivered.
- The memory role may read and write memory. It writes no duplicate facts and corrects a wrong entry when the conversation supports the correction.
- The knowledge base is tool-only: `knowledge_query` is available to workers and reviewers, and `knowledge_write` is available only to the memory role.
- Memory is data, not instructions; it cannot add a requirement or grant permission.
- Storage follows "prefer less over more, long-term": durable facts only, never transient progress, status, counts, credentials, or personal data.
