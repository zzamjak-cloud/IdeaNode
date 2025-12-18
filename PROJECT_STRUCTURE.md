# IdeaNode 프로젝트 구조 & 버전 히스토리

이 문서는 **IdeaNode(Tauri + React + Rust + SQLite)** 프로젝트의 구조를 설명하고, 앞으로의 **버전 히스토리(변경 이력)**를 누적 기록하기 위한 파일입니다.

---

## 프로젝트 개요
- **앱 형태**: Tauri 기반 데스크톱 앱
- **핵심 기능**: 카테고리/메모 관리, 드래그앤드롭 정렬/이동, 텍스트(리치) 편집, 로컬 SQLite 영구 저장

---

## 기술 스택
- **Frontend**: React 19 + Vite + TypeScript
- **Desktop Runtime**: Tauri v2
- **Backend**: Rust (Tauri commands)
- **DB**: SQLite (`rusqlite` + bundled)
- **상태 관리**: Zustand
- **DnD**: dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`)
- **에디터**: TipTap (`@tiptap/react`, `@tiptap/starter-kit`)
- **이모지 피커**: `emoji-picker-react`
- **아이콘**: `lucide-react`

---

## 디렉터리 구조(요약)

### Frontend (`IdeaNode/src/`)
- `App.tsx`
  - 앱 루트. 초기 `refresh()`로 DB 데이터/설정을 로드하고, 앱 배경 컬러(CSS var `--bg`)를 적용합니다.
- `App.css`
  - 전역 스타일(모달, 그리드, hover-only 아이콘, DnD 시각 피드백, popover/portal 등)
- `features/categories/*`
  - `CategoryGrid.tsx`: 상단바(검색/+ / 배경색 팔레트), 카테고리 렌더, DnD 컨텍스트, 삭제 confirm 모달 등
  - `CategoryCard.tsx`: 카테고리 카드 UI(제목/이모지 표시, 접기/삭제/추가 버튼, 메모 리스트)
  - `CategorySettingsModal.tsx`: 카테고리 편집(제목/이모지/텍스트컬러) — 상단 배치 모달
  - `CreateCategoryModal.tsx`: 카테고리 생성(기본 컬러 프리셋 포함)
  - `SortableCategoryCard.tsx`: 카테고리 그리드 정렬 Sortable 래퍼
- `features/memos/*`
  - `MemoEditorModal.tsx`: 메모 편집(이모지/제목/날짜/텍스트 컬러/저장/닫기) + TipTap 에디터 + 자동 저장
  - `SortableMemoRow.tsx`: 카테고리 내 메모 Sortable 행(이모지/제목/삭제/날짜 표시)
- `components/*`
  - `Modal.tsx`: 공통 모달(헤더 커스텀/상단 배치/바디 숨김 등)
  - `ColorPicker.tsx`: 텍스트 컬러 프리셋 + 커스텀
  - `EmojiPicker.tsx`: emoji-picker-react 기반 이모지 선택 + 직접 입력
  - `AnchoredPopover.tsx`: 앵커 기준 popover를 `document.body`에 포탈 렌더링(창/모달에 의해 잘리지 않게)
- `store/appStore.ts`
  - Zustand 스토어: `categories`, `settings`, CRUD/refresh 액션
- `lib/tauri.ts`
  - Tauri `invoke` API 래퍼(타입 고정)
- `lib/date.ts`
  - `YYYY-MM-DD` → `25. 1. 27` 형태 포매팅 유틸
- `types.ts`
  - 프론트 타입 정의(Category/Memo/Settings 등)

### Tauri / Rust (`IdeaNode/src-tauri/`)
- `src/lib.rs`
  - Tauri 엔트리. DB 초기화 후 state 주입 + command 등록
- `src/db.rs`
  - SQLite 오픈(앱 데이터 디렉터리), 마이그레이션 관리(PRAGMA user_version)
- `src/models.rs`
  - serde 모델/DTO 정의(Category/Memo/Settings 등)
- `src/commands.rs`
  - Tauri commands: categories/memos CRUD, reorder, move, app settings 저장/조회

---

## 데이터 저장(로컬 SQLite)

### DB 파일 위치
- Tauri appDataDir 아래: `ideanode.sqlite3`

### 주요 테이블(개념)
- `categories`
  - `emoji`, `title`, `color(텍스트 컬러)`, `position`, `is_collapsed`, timestamps
- `memos`
  - `emoji`, `title`, `color(텍스트 컬러)`, `date_ymd`, `content_md(현재는 HTML 문자열 저장)`, `position`, timestamps
- `settings`
  - `background_color` 등 앱 전역 설정을 key-value로 저장

### 마이그레이션 버전(PRAGMA user_version)
- v1: 초기 스키마(categories + memos)
- v2: memos에 `date_ymd` 추가
- v3: categories에 `emoji` 추가 + settings 테이블 추가
- v4: memos에 `emoji` 추가

---

## 주요 UX/동작 원칙
- **텍스트 컬러**: 카테고리/메모의 `color`는 점/원형이 아니라 **텍스트 자체에 적용**
- **아이콘 노출 규칙(hover-only)**:
  - 카테고리 제목바 hover → 카테고리 기능 아이콘
  - 메모 row hover → 해당 메모의 삭제 버튼만
- **DnD**:
  - 카테고리 그리드 정렬
  - 카테고리 내 메모 정렬
  - 메모 카테고리 간 이동
  - DragOverlay/DropTarget 하이라이트로 시각 피드백 제공
  - 검색 중에는 혼란 방지를 위해 DnD 비활성화
- **삭제 확인**:
  - `window.confirm` 대신 앱 내부 Confirm 모달(tauri/webview 호환성)
- **자동 저장**:
  - 디바운스 저장(기본 1.2초) + 닫기 직전 flush 저장
  - create 모드에서도 초안 메모를 즉시 생성해 유실 방지

---

## 개발 실행 방법(로컬)
- 개발 실행:
  - `npm run tauri dev`
- 프론트 빌드(타입 체크 포함):
  - `npm run build`
- Rust 체크:
  - `cd src-tauri && cargo check`

---

## 버전 히스토리

### v0.1.0 (2025-12-18)
- **Tauri+React 기본 프로젝트 구성** 확정
- **SQLite 영구 저장**(categories/memos/settings) + 마이그레이션 체계(PRAGMA user_version)
- **카테고리 기능**
  - 생성/삭제/접기/펼치기
  - 제목 클릭으로 편집 모달 오픈(노션 스타일)
  - 이모지/텍스트 컬러(프리셋+커스텀) 지원
  - 그리드 DnD 정렬
- **메모 기능**
  - 생성/삭제/편집(이모지/제목/날짜/텍스트컬러/본문)
  - 날짜 표기: `25. 1. 27` 스타일
  - 카테고리 내 메모 DnD 정렬 + 다른 카테고리로 이동
  - 자동 저장(디바운스 + 닫기 직전 flush, create 모드 초안 생성)
- **UI/UX**
  - hover-only 아이콘 노출, icon-only 버튼 스타일
  - DragOverlay + drop target 표시
  - 검색(카테고리/메모 제목 즉시 필터) + 검색 중 DnD 비활성화
  - 상단 배경색 팔레트(앱 배경 컬러 커스텀/저장)
  - 이모지 팝업은 portal popover로 렌더링되어 창/모달에 의해 잘리지 않음


