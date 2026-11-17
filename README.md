# doj-tier-warning

A Tampermonkey userscript that adds customizable difficulty warnings to DOJ while keeping exact problem tiers hidden.

Tampermonkey에서 실행하는 개인용 사용자 스크립트입니다. DOJ의 `/problems` 티어 보이기를 껐을 때 정확한 티어 대신 `…`, `!`, `!!`를 표시합니다.

<!-- userscript-install:start -->
[설치 / 최신 버전으로 갱신](https://raw.githubusercontent.com/Mist0713/doj-tier-warning/main/doj-tier-warning.user.js)
<!-- userscript-install:end -->

## GitHub 게시와 자동 업데이트

GitHub의 `main` 브랜치에 있는 `.meta.js`로 버전을 확인하고 `.user.js`로 새 코드를 받습니다. 스크립트의 `@name`과 `@namespace`는 그대로 유지하므로 기존 설정 저장소를 이어서 사용합니다.

개발·배포에는 Git과 Node.js 20 이상이 필요합니다. 스크립트를 설치해서 쓰기만 할 때는 Tampermonkey만 있으면 됩니다.

기존 폴더를 계속 사용하려면 GitHub의 **Code → Download ZIP**으로 최신 파일을 받아 해당 폴더에 반영한 후 아래 명령을 실행하세요. 상위 `n0thing`과 별도의 Git 저장소를 생성하고 `Mist0713/doj-tier-warning`의 `main` 브랜치와 연결합니다. 기존 작업 파일은 보존합니다. 최초 푸시에서 GitHub 로그인이 필요할 수 있습니다.

```powershell
.\setup-github.ps1
```

위 설치 링크를 열어 Tampermonkey에 한 번 설치/갱신하세요. 기존에 직접 붙여넣은 스크립트도 이 단계가 필요합니다. Tampermonkey의 해당 스크립트 설정에서 업데이트 확인이 켜져 있어야 합니다. 이후에는 확장 프로그램의 업데이트 확인 주기에 따라 갱신되며, 푸시 직후 즉시 반영되는 것은 아닙니다.

앞으로 코드를 수정한 다음 이 명령을 실행하세요.

```powershell
.\publish-update.ps1 -Message '변경 내용'
```

테스트 → 패치 버전 증가 → 두 스크립트의 버전/배포 URL 동기화 → 커밋 → `main` 푸시 순서로 처리합니다. 예를 들어 0.1.1에서 0.1.2로 증가합니다. `-Bump minor` 또는 `-Bump major`도 사용할 수 있습니다. 자동 업데이트가 받는 것은 GitHub에 푸시된 버전이므로 로컬 파일을 저장하는 것만으로는 배포되지 않습니다.

수동으로 관리하려면 `npm run release` 후 생성된 `.user.js`, `.meta.js`, `package.json`, `package-lock.json`을 함께 커밋·푸시하세요. `npm run release:check`로 버전과 배포 URL의 일치를 확인할 수 있습니다.

- [Tampermonkey 업데이트 메타데이터 문서](https://www.tampermonkey.net/documentation.php?q=update_url)

## 설치

1. Tampermonkey를 설치하고 위의 **설치 / 최신 버전으로 갱신** 링크를 엽니다.
2. Tampermonkey의 설치 화면에서 설치 또는 갱신을 선택합니다.
3. DOJ 설정 페이지를 새로고침합니다.
4. **문제 풀이 → 티어 보이기 → /PROBLEMS** 체크를 끄고 DOJ의 기존 저장 버튼으로 저장합니다.
5. 추가된 **티어 경고** 행의 `/PROBLEMS`를 체크하고 두 하한을 고릅니다. 이 설정은 즉시 저장됩니다.

Chrome에서 Tampermonkey가 사용자 스크립트 실행 허용을 요청하면 확장 프로그램 안내에 따라 허용해야 합니다.

## 표시 규칙

| 난이도 | 표시 |
| --- | --- |
| `!` 하한 미만 | 회색 `…` |
| `!` 하한 이상, `!!` 하한 미만 | 노란색 `!` |
| `!!` 하한 이상 | 빨간색 `!!` |
| 미평가·비공개·조회 실패 | 회색 `?` |
| 조회 중 | 옅은 회색 `…` |

- 두 하한은 Bronze V부터 Ruby I까지 각각 선택합니다. 하한을 포함합니다.
- 기본값은 `!`: Platinum V, `!!`: Diamond V입니다. 최초 설치 시 기능은 꺼져 있습니다.
- `!`가 `!!`보다 높아지면 다른 하한을 함께 조정합니다. 같으면 `!!`가 우선합니다.
- 목록에는 **티어 경고** 열을 추가합니다. 개별 문제 페이지에서는 기존 **난이도 보기** 버튼 자리에 경고를 표시하며, 직접 클릭하면 DOJ의 원래 난이도 공개 동작을 실행합니다.
- 경고 아이콘의 툴팁과 접근성 이름에는 실제 티어를 넣지 않습니다.
- 카테고리·문제집·그룹·대회·프로필에는 적용하지 않습니다. `/problems/recent` 등 별도 목록도 첫 버전 범위에서 제외합니다.
- DOJ 티어 보이기를 켜면 경고 설정을 비활성화하고 원래 표시를 따릅니다. 기존 경고 설정값은 보존합니다.

## 데이터와 동작

- 설정은 Tampermonkey의 스크립트 저장소에 저장하며 DOJ 계정에 업로드하지 않습니다. 같은 브라우저 프로필에서 공유되며 계정·기기 간 동기화는 제공하지 않습니다.
- 같은 출처의 `/ko/settings`(또는 현재 언어의 설정)를 읽어 현재 `/PROBLEMS` 티어 숨김을 확인합니다. 로그인이 풀렸거나 설정 구조가 달라 판독할 수 없으면 경고를 표시하지 않습니다.
- 공개 API `GET /api/v1/problems/{displayId}`에서 **난이도 값만** 사용합니다. 풀이 태그를 표시하거나 저장하지 않습니다. 비공개/진행 중 대회 데이터의 제한을 우회하지 않습니다.
- 난이도 캐시는 6시간 유지합니다. 최초 목록에서는 한 문제씩 순차 조회하므로 20개 행이 채워지는 데 약 14초와 통신 시간이 걸릴 수 있습니다. 다른 페이지로 이동하면 대기 중인 조회를 취소합니다.
- 요청 간격은 최소 약 700ms이며, HTTP 429에서는 `Retry-After`를 존중하고 최소 60초 동안 요청을 중단합니다. 오류를 낮은 난이도로 처리하지 않습니다.
- 페이지 이동·목록 갱신을 감지합니다. 기능을 끄면 추가한 표시를 제거합니다.
- 외부 라이브러리, 외부 이미지, 외부 서버 전송, 원격 코드 로딩 없이 실행합니다.

## 참고와 검증 범위

2026-11-18 기준 DOJ의 공개 문제 목록 HTML, 개별 문제 페이지의 난이도 공개 컴포넌트, 공개 API 응답을 확인했습니다. 로그인한 설정 페이지는 접근할 수 없어, 사용자가 제공한 설정 표를 바탕으로 행/열 라벨을 탐지하도록 구현했습니다. **실제 로그인 계정에서의 설치·설정 저장까지는 검증하지 못했습니다.**

DOM 통합 테스트는 설정 행의 활성화, 두 하한과 경계값, 미평가·통신 오류, 공개/숨김 상태, 페이지 이동, 공개 버튼, 캐시, 제한 응답 등을 확인합니다. 테스트용 DOM은 로그인 설정 표를 재현한 것으로 실제 계정 검증을 대신하지 않습니다.

solved.ac의 공식 공개 저장소도 확인했으나 요청한 최신 경고 아이콘에 해당하는 재사용 소스를 확인하지 못했습니다. 이 스크립트의 아이콘은 HTML/CSS로 직접 구현했습니다. solved.ac의 이미지나 코드는 포함하지 않습니다.

- [DOJ 설정](https://doj.kr/ko/settings)
- [DOJ 공개 API 문서](https://doj.kr/ko/guide/api)
- [solved.ac의 과거 브라우저 플러그인](https://github.com/solved-ac/plugin)
- [solved.ac UI 컴포넌트](https://github.com/solved-ac/ui-react)

설정 행이 보이지 않으면 설정 페이지를 새로고침하고 스크립트가 켜져 있는지 확인하세요. 그래도 안 보이면 로그인된 설정 표의 HTML(행/체크박스 부분만)을 받아 탐지 코드를 맞춰야 합니다.

## 개발용 테스트

Node.js 20 이상과 `happy-dom@15.11.7`이 필요합니다.

```sh
npm install
npm test
```
