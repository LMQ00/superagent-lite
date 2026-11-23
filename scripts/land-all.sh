#!/usr/bin/env bash
# land-all.sh — 按计划顺序把已审查的 sl-superagent-lite-* worker 分支合入 master。
#
# 用法:
#   scripts/land-all.sh --dry-run   只打印计划，不改动仓库（可在任意检出中运行）
#   scripts/land-all.sh             在 master 检出、工作区干净时执行合并
#
# 每条分支:
#   1. 已合入 master 的分支直接跳过（幂等，可反复运行）。
#   2. 只合入 review.approved === true 且 review.head === 分支 tip 的分支；
#      审查缺失、未通过或 head 已前移的分支列在末尾，提示先重审。
#   3. git merge --no-ff（diff3 冲突样式）；文本冲突仅在“双方纯新增”
#      （base 段为空、两边都新增内容）时自动保留双方，add/add 同一路径
#      及其它冲突立即停下并保留 merge 现场。
#   4. 每次合并（含自动解冲突后）运行 npm test，失败即停并打印失败用例。
#
# 风险:
#   - 直接改写本地 master 并创建 merge commit；不会 push。
#   - 自动解冲突只覆盖“双方纯新增”的文本块，以及 add/add 同一路径一律
#     转人工。同一行被双方改写、删除或语义冲突同样停下人工处理；
#     npm test 通过也不等于语义正确，合并后仍需审查。
#   - 任务记录不会自动改成 merged。合入后刷新 Git 面板，确认任务已完成并删除分支。
#   - 合并顺序只是最小冲突的起点，不保证后续分支不冲突；冲突会让脚本停在原地。
#
# 可用环境变量:
#   LAND_ALL_BASE       基础分支，默认 master
#   LAND_ALL_TASKS_DIR  任务记录目录，默认 ~/.dsh/superagent-lite/tasks

set -euo pipefail

BASE_BRANCH="${LAND_ALL_BASE:-master}"
TASKS_DIR="${LAND_ALL_TASKS_DIR:-$HOME/.dsh/superagent-lite/tasks}"
BRANCH_PREFIX="sl-superagent-lite-"
DRY_RUN=0

ORDER=(
  sl-superagent-lite-29dba2f52e41a385
  sl-superagent-lite-2bda3c5136a71f55
  sl-superagent-lite-516e3115f332d9a0
  sl-superagent-lite-669e70474a677c9d
  sl-superagent-lite-9c2ee9c780815a4b
  sl-superagent-lite-b8414db2a34e4430
  sl-superagent-lite-f270c878c58d623f
)

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  printf 'land-all: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $arg（用法见 --help）" ;;
  esac
done

if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  die "当前目录不在 git 仓库内"
fi
cd "$REPO_ROOT"

BASE_REF="refs/heads/$BASE_BRANCH"
if ! git rev-parse -q --verify "$BASE_REF" >/dev/null; then
  die "找不到基础分支 $BASE_BRANCH"
fi

CURRENT_BRANCH="$(git symbolic-ref --short -q HEAD || true)"
MERGE_IN_PROGRESS=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  MERGE_IN_PROGRESS=1
fi

if [ "$DRY_RUN" -eq 0 ]; then
  [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ] \
    || die "实际执行必须在 $BASE_BRANCH 检出中运行（当前: ${CURRENT_BRANCH:-detached}）。先合并本脚本所在分支，或切到 $BASE_BRANCH 后重跑。"
  [ -d "$TASKS_DIR" ] || die "任务记录目录不存在: $TASKS_DIR"
  [ "$MERGE_IN_PROGRESS" -eq 0 ] \
    || die "$BASE_BRANCH 有未完成的 merge。先解冲突并 git commit，或 git merge --abort 后重跑。"
  [ -z "$(git status --porcelain)" ] \
    || die "$BASE_BRANCH 工作区不干净，先提交或清理后再运行"
fi

contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

branch_tip() {
  git rev-parse "refs/heads/$1"
}

is_merged() {
  git merge-base --is-ancestor "$(branch_tip "$1")" "$BASE_REF"
}

# 输出 4 个 tab 分隔字段: approved、review.head、status、title
task_meta() {
  local file="$TASKS_DIR/$1.json"
  if [ ! -f "$file" ]; then
    printf 'false\t\t\t\n'
    return 0
  fi
  node -e '
const fs = require("fs")
try {
  const task = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const review = task.review || {}
  process.stdout.write([
    review.approved === true ? "true" : "false",
    String(review.head || ""),
    String(task.status || ""),
    String(task.title || "").replace(/\s+/g, " "),
  ].join("\t"))
} catch {
  process.stdout.write("false\t\t\t")
}
' "$file" 2>/dev/null || printf 'false\t\t\t\n'
}

# 设置全局 TASK_ID/TASK_TITLE/TASK_STATUS/REVIEW_OK/REVIEW_LABEL
check_review() {
  local branch="$1" tip="$2" approved reviewed_head
  TASK_ID="${branch#"$BRANCH_PREFIX"}"
  TASK_TITLE=""
  TASK_STATUS=""
  IFS=$'\t' read -r approved reviewed_head TASK_STATUS TASK_TITLE <<< "$(task_meta "$TASK_ID")"
  if [ "$approved" = "true" ] && [ "$reviewed_head" = "$tip" ]; then
    REVIEW_OK=1
    REVIEW_LABEL="已审 ${tip:0:7}"
  elif [ ! -f "$TASKS_DIR/$TASK_ID.json" ]; then
    REVIEW_OK=0
    REVIEW_LABEL="无任务记录"
  elif [ -z "$reviewed_head" ] || [ "$approved" != "true" ]; then
    REVIEW_OK=0
    REVIEW_LABEL="未审查"
  else
    REVIEW_OK=0
    REVIEW_LABEL="需重审 ${reviewed_head:0:7}≠${tip:0:7}"
  fi
}

# 只在所有冲突文件都能按“双方纯新增”合并时才写文件；否则一个都不改。
resolve_additive_conflicts() {
  node --input-type=module - "$@" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'

const resolved = new Map()
const unsafe = []
const isMarker = line => /^(<<<<<<<|=======|\|\|\|\|\|\|\||>>>>>>>)/.test(line)

for (const file of process.argv.slice(2)) {
  let raw
  try {
    raw = readFileSync(file)
  } catch (error) {
    unsafe.push(`${file}: ${error.message}`)
    continue
  }
  if (raw.includes(0)) {
    unsafe.push(`${file}: 二进制文件`)
    continue
  }
  const lines = raw.toString('utf8').split('\n')
  const out = []
  let state = 'normal'
  let ours = []
  let base = []
  let theirs = []
  let sawBase = false
  let malformed = false
  let hunks = 0
  for (const line of lines) {
    if (line.startsWith('<<<<<<< ')) {
      if (state !== 'normal') { malformed = true; break }
      state = 'ours'
      ours = []
      base = []
      theirs = []
      sawBase = false
      continue
    }
    if (line.startsWith('||||||| ') && state === 'ours') {
      state = 'base'
      sawBase = true
      continue
    }
    if (line === '=======' && (state === 'ours' || state === 'base')) { state = 'theirs'; continue }
    if (line.startsWith('>>>>>>> ') && state === 'theirs') {
      hunks += 1
      const additive = sawBase && base.length === 0 && ours.length > 0 && theirs.length > 0
      if (!additive || ours.some(isMarker) || theirs.some(isMarker)) {
        malformed = true
        break
      }
      out.push(...ours, ...theirs)
      state = 'normal'
      continue
    }
    if (state === 'ours') ours.push(line)
    else if (state === 'base') base.push(line)
    else if (state === 'theirs') theirs.push(line)
    else out.push(line)
  }
  if (state !== 'normal' || hunks === 0) malformed = true
  if (malformed) {
    unsafe.push(`${file}: 冲突块不是“双方纯新增”或格式异常`)
    continue
  }
  resolved.set(file, out.join('\n'))
}

if (unsafe.length > 0) {
  for (const reason of unsafe) console.error(`  ${reason}`)
  process.exit(2)
}
for (const [file, content] of resolved) writeFileSync(file, content)
console.log([...resolved.keys()].join('\n'))
NODE
}

print_conflict_help() {
  local branch="$1"
  shift
  printf 'land-all: %s 的冲突无法安全自动解决，已停止（merge 仍在进行中）。\n' "$branch" >&2
  printf '冲突文件:\n' >&2
  printf '  %s\n' "$@" >&2
  printf '建议:\n' >&2
  printf '  1. 在 %s 检出中逐个编辑冲突文件，按“保留双方逻辑”手工合并。\n' "$BASE_BRANCH" >&2
  printf '  2. git add <冲突文件> && git commit --no-edit && npm test\n' >&2
  printf '  3. 处理完后重跑 scripts/land-all.sh；已合入的分支会自动跳过。\n' >&2
}

# 合并成功返回 0；冲突停下返回 1。
attempt_merge() {
  local branch="$1" tip="$2"
  local conflicted=() file merge_head merge_base
  local add_add=()

  if git -c merge.conflictStyle=diff3 merge --no-ff --no-edit "$tip"; then
    return 0
  fi

  while IFS= read -r file; do
    [ -n "$file" ] && conflicted+=("$file")
  done < <(git diff --name-only --diff-filter=U)

  if [ "${#conflicted[@]}" -eq 0 ]; then
    printf 'land-all: %s 的 git merge 失败，但没有冲突文件；见上方错误。\n' "$branch" >&2
    return 1
  fi

  printf 'land-all: %s 出现文本冲突:\n' "$branch" >&2
  printf '  %s\n' "${conflicted[@]}" >&2

  if ! merge_head="$(git rev-parse MERGE_HEAD 2>/dev/null)"; then
    printf 'land-all: 找不到 MERGE_HEAD，无法判定冲突类型。\n' >&2
    print_conflict_help "$branch" "${conflicted[@]}"
    return 1
  fi
  if ! merge_base="$(git merge-base HEAD "$merge_head")"; then
    printf 'land-all: 无法计算 merge-base，不能安全判定冲突。\n' >&2
    print_conflict_help "$branch" "${conflicted[@]}"
    return 1
  fi

  # add/add 冲突的 diff3 base 段同样为空，但整文件拼接不安全。
  for file in "${conflicted[@]}"; do
    if ! git cat-file -e "$merge_base:$file" 2>/dev/null; then
      add_add+=("$file")
    fi
  done
  if [ "${#add_add[@]}" -gt 0 ]; then
    printf 'land-all: 以下文件在 merge-base 中不存在（双方各自新增同一路径），不能自动拼接：\n' >&2
    printf '  %s\n' "${add_add[@]}" >&2
    print_conflict_help "$branch" "${conflicted[@]}"
    return 1
  fi

  if ! resolve_additive_conflicts "${conflicted[@]}"; then
    print_conflict_help "$branch" "${conflicted[@]}"
    return 1
  fi

  git add -- "${conflicted[@]}"
  if ! git commit --no-edit >/dev/null; then
    printf 'land-all: 自动解冲突后提交 merge 失败。\n' >&2
    return 1
  fi
  info "已按“双方纯新增”自动解冲突并提交"
  return 0
}

run_tests() {
  local branch="$1" log status
  log="$(mktemp "${TMPDIR:-/tmp}/land-all-test.XXXXXX")" || die "无法创建临时文件"
  info "npm test ..."
  if npm test >"$log" 2>&1; then
    rm -f "$log"
    info "npm test 通过"
    return 0
  fi
  status=$?
  printf 'land-all: 合并 %s 后 npm test 失败，已停止。修复后重跑，已合入分支会自动跳过。\n' "$branch" >&2
  printf '失败用例（摘要）:\n' >&2
  grep -E '^(not ok|# fail|# tests|# pass)|✖|failing tests:' "$log" | tail -n 40 >&2 || true
  printf '完整输出（末尾）:\n' >&2
  tail -n 100 "$log" >&2
  rm -f "$log"
  exit 1
}

BRANCHES=()
for branch in "${ORDER[@]}"; do
  if git rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
    BRANCHES+=("$branch")
  fi
done
while IFS= read -r ref; do
  branch="${ref#refs/heads/}"
  case "$branch" in
    "$BRANCH_PREFIX"*) ;;
    *) continue ;;
  esac
  [ "$branch" = "$BASE_BRANCH" ] && continue
  contains "$branch" "${ORDER[@]}" && continue
  BRANCHES+=("$branch")
done < <(git for-each-ref --format='%(refname)' refs/heads)

if [ "${#BRANCHES[@]}" -eq 0 ]; then
  info "没有找到 $BRANCH_PREFIX* 分支。"
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  info "land-all --dry-run（只打印计划，不改动仓库）"
  info "仓库: $REPO_ROOT"
  info "基础分支: $BASE_BRANCH ($(git rev-parse --short "$BASE_REF"))"
  info "当前检出: ${CURRENT_BRANCH:-detached}（实际执行需在 $BASE_BRANCH 检出、工作区干净）"
  if [ ! -d "$TASKS_DIR" ]; then
    info "警告: 任务目录不存在: $TASKS_DIR；所有分支都会被列为需重审"
  fi
  if [ "$MERGE_IN_PROGRESS" -eq 1 ]; then
    info "警告: 当前有未完成的 merge；实际执行前需先解决。"
  fi
  info ""
  printf '  %-3s %-46s %-12s %-28s %s\n' "#" "分支" "状态" "审查" "相对 master 差异"
  merge_count=0
  skip_count=0
  review_count=0
  index=0
  for branch in "${BRANCHES[@]}"; do
    index=$((index + 1))
    if is_merged "$branch"; then
      state="跳过：已合入"
      review_label="—"
      diff_stat=""
      skip_count=$((skip_count + 1))
    else
      check_review "$branch" "$(branch_tip "$branch")"
      review_label="$REVIEW_LABEL"
      diff_stat="$(git diff --shortstat "$BASE_BRANCH...$branch")"
      if [ "$REVIEW_OK" -eq 1 ]; then
        state="待合并"
        merge_count=$((merge_count + 1))
      else
        state="需先重审"
        review_count=$((review_count + 1))
      fi
    fi
    [ -n "$diff_stat" ] || diff_stat="无差异"
    printf '  %-3s %-46s %-12s %-28s %s\n' "$index" "$branch" "$state" "$review_label" "$diff_stat"
  done
  info ""
  info "计划: 合并 $merge_count 条；跳过 $skip_count 条（已在 master）；需先重审 $review_count 条。"
  info "已知冲突与理由见 docs/009-land-all.md；脚本会在无法安全自动解决的冲突处停下。"
  exit 0
fi

info "land-all: 把已审的 $BRANCH_PREFIX* 分支合入 $BASE_BRANCH"
MERGED_BRANCHES=()
MERGED_TITLES=()
SKIPPED_REVIEW=()

for branch in "${BRANCHES[@]}"; do
  if is_merged "$branch"; then
    info "跳过 $branch: 已在 $BASE_BRANCH"
    continue
  fi

  tip="$(branch_tip "$branch")"
  check_review "$branch" "$tip"
  if [ "$REVIEW_OK" -ne 1 ]; then
    info "跳过 $branch: $REVIEW_LABEL；先重审后再运行"
    SKIPPED_REVIEW+=("$branch|$REVIEW_LABEL")
    continue
  fi

  [ -z "$(git status --porcelain)" ] || die "$BASE_BRANCH 工作区在合并前变脏，停止"
  info ""
  info "==> 合并 $branch ($tip)"
  if ! attempt_merge "$branch" "$tip"; then
    exit 1
  fi
  run_tests "$branch"

  if ! git merge-base --is-ancestor "$tip" "$BASE_REF"; then
    die "合并后审查过的提交 $tip 仍不是 $BASE_BRANCH 的祖先，停止"
  fi
  MERGED_BRANCHES+=("$branch")
  MERGED_TITLES+=("$TASK_TITLE")
  if [ "$(branch_tip "$branch")" != "$tip" ]; then
    info "警告: $branch 在合并期间前移，最新 tip 未合入，需重审后再跑"
    SKIPPED_REVIEW+=("$branch|分支 tip 已前移")
  fi
done

info ""
info "完成: $BASE_BRANCH 新 HEAD $(git rev-parse HEAD)"
if [ "${#MERGED_BRANCHES[@]}" -gt 0 ]; then
  info "本次合入:"
  for i in "${!MERGED_BRANCHES[@]}"; do
    branch="${MERGED_BRANCHES[$i]}"
    info "  - ${branch#"$BRANCH_PREFIX"}  ${MERGED_TITLES[$i]}"
  done
fi

info ""
info "Git 面板剩余项（刷新后处理）:"
if [ "${#MERGED_BRANCHES[@]}" -gt 0 ]; then
  for branch in "${MERGED_BRANCHES[@]}"; do
    id="${branch#"$BRANCH_PREFIX"}"
    info "  - Task $id: 应显示“已完成”；若仍显示“未合并”，点“合并/完成”记录状态，再删除 worker 分支。"
  done
else
  info "  - 无（没有新合入的分支）"
fi
if [ "${#SKIPPED_REVIEW[@]}" -gt 0 ]; then
  info "需先重审，暂未合入:"
  for item in "${SKIPPED_REVIEW[@]}"; do
    info "  - ${item%%|*}（${item##*|}）"
  done
fi
