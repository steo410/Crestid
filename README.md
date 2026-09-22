# Crestid

개인용 `steo410/cre`와 분리한 공용 프로젝트입니다. 기존 개인용 데이터나 비밀번호를 복사하지 않습니다.

## 구현된 기능

메뉴는 대시보드, 개체 관리, 성장 기록, 교배·가계도, 모프 도감, 유전·교배 예상의 6개입니다. 가계부·백업·개인용 GitHub 동기화 메뉴는 포함하지 않습니다.

- Google 계정으로 로그인하여 자기 개체·성장·교배 기록을 관리합니다.
- 개체는 기본 비공개입니다. 공개 여부를 개체별로 바꿀 수 있습니다.
- 공개 정보: 개체명, 표시 모프, 성별, 부화일, 사진, 특징, 유전자형. 계정 이메일·이름, 개인 메모, 입양일, 출처, 혈통 원문, 부모 ID, 성장·교배 기록은 공개 데이터에 넣지 않습니다.
- 내 개체와 타인의 공개 개체를 교배 예상에서 선택할 수 있습니다. 계산 직전에 공개 상태를 서버에서 다시 확인합니다. 공개 목록은 200마리씩 더 불러올 수 있습니다.
- 사진은 개체당 3장, 각 약 135 KB 이하로 압축하여 저장합니다. 초기 규모에서 별도 유료 사진 저장 서비스를 요구하지 않도록 한 제한입니다.
- 성장 기록 수정·삭제, 날짜 간격을 반영한 체중 그래프, 부모 기반 가계도, 교배 기록을 제공합니다.
- 도감은 기존 46개로 시작합니다. 로그인 버튼을 누르지 않아도 추가·수정·삭제·복원이 가능합니다. 저장 시 Firebase 익명 인증이 내부적으로 사용됩니다.
- 모프명, 영문명, 분류, 특징, 상세 설명, 별칭, 출처, 유전 방식 모두 편집 가능합니다.
- 유전 방식: 공우성, 우성, 불완전우성, 열성, 다인자·선별교배 형질, 유전 형질 아님, 여러 형질의 조합, 미확인·연구 중.
- 도감 삭제는 복구 가능한 삭제 표시입니다. 기존 항목과 이력은 보존되며 수정 충돌을 감지합니다. 최신 30개 변경과 초기 안내에서 복원할 수 있습니다.
- 유전 계산은 릴리화이트·아잔틱·카푸치노의 명시된 유전자형을 사용합니다. 미확인을 정상 유전자로 간주하지 않습니다. 도감 설명 편집이 계산식에 영향을 주지 않습니다.

## 저장 구성

- GitHub: 프로그램 코드만 저장.
- Vercel: 정적 사이트 배포.
- Firebase Authentication: Google 로그인 + 도감 편집용 익명 인증.
- Cloud Firestore: 사용자별 기록, 공개 개체 사본, 공용 도감, 변경 이력.
- 브라우저: 로그인 세션만 유지. Firestore 개인 기록의 영구 디스크 캐시와 이전 개인용 localStorage 자동 가져오기를 사용하지 않습니다.

`users/{uid}/geckos`, `growth`, `pairings`는 해당 Google 계정만 접근합니다. `publicGeckos`는 허용된 필드만 가진 별도 문서입니다. 공개 해제와 공개 사본 삭제는 하나의 트랜잭션으로 처리됩니다. `morphs/{id}/history/{revision}`은 새 이력 추가만 허용합니다. 모든 미지정 경로는 접근을 거부합니다.

## 최초 연결 — 한 번만 필요

### 1. 새 Firebase 프로젝트

1. https://console.firebase.google.com/ 에서 새 프로젝트를 만듭니다. 기존 개인용 프로젝트와 분리하세요.
2. 무료 Spark 요금제를 유지합니다. 결제수단·Cloud Billing 계정을 연결하거나 Blaze로 업그레이드하지 마세요. Analytics는 필수가 아닙니다. 무료 한도 초과 시 요청이 제한될 수 있습니다. Cloud Storage·Cloud Functions는 사용하지 않습니다.
3. **Authentication → Sign-in method**에서 **Google**과 **Anonymous(익명)**를 활성화합니다. Google 설정에 지원 이메일을 지정합니다.
4. **Firestore Database**를 생성합니다. **Standard**, 프로덕션 모드를 선택하고 서비스 지역을 정합니다. 서울 `asia-northeast3`를 사용할 수 있습니다. 생성 후 위치를 쉽게 변경할 수 없으므로 직접 확인하세요.
5. 프로젝트 설정에서 **웹 앱**을 등록합니다. `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 복사합니다. 이들은 웹 앱 공개 설정값입니다. 서비스 계정 JSON·비밀키와 다릅니다.
6. `firebase-config.js`의 빈 값을 채우거나, Vercel 환경 변수 **FIREBASE_WEB_CONFIG**에 이 네 값으로 된 JSON 객체를 설정합니다. 후자가 파일 수정 없이 재배포하기 편합니다. 서비스 계정 비밀키는 넣지 마세요.
7. 태블릿에서는 Firestore Database → Rules(규칙) 탭에 이 저장소의 `firestore.rules` 전체 내용을 붙여 넣고 Publish(게시)를 누릅니다. 컴퓨터에서는 아래 명령으로 규칙과 인덱스를 함께 배포할 수도 있습니다.

```powershell
npm ci
npx firebase login
npx firebase deploy --only firestore --project 여기에-Firebase-프로젝트ID
```

8. 사이트 배포 후 Authentication → Settings → Authorized domains에 **실제 Vercel 운영 도메인**을 추가합니다. 로컬 로그인 시험을 할 경우 `localhost`도 별도로 등록합니다.

### 2. GitHub 저장소

코드 저장소: https://github.com/steo410/Crestid

사용자 기록은 GitHub에 저장하지 않습니다. 기존 개인용 `steo410/cre`와 별개의 프로젝트입니다.

### 3. Vercel 새 프로젝트

1. Vercel에서 Add New → Project를 선택합니다.
2. `steo410/Crestid` 저장소를 Import합니다.
3. Framework Preset은 **Other**, Build Command는 `npm run build`, Output Directory는 `public`입니다. `vercel.json`에 설정되어 있습니다.
4. **FIREBASE_WEB_CONFIG**를 쓴다면 Production·Preview 환경에 값을 입력합니다.
5. Deploy 후 운영 도메인을 위 Firebase 승인 도메인에 추가합니다.
6. 서로 다른 두 Google 계정으로 비공개 격리와 공개 개체 사용을 최종 확인합니다.

Firebase 설정이 비어 있으면 도감 열람만 가능하고, 로그인·저장을 사용할 수 없다는 안내가 나타납니다. 가짜 로그인이나 로컬 저장 성공 메시지로 대체하지 않습니다.

## 개발 및 검증

```powershell
npm ci
npm test
npm run build
npm run dev
```

`http://localhost:4173`에서 확인합니다. Java 17 이상이 있으면 실제 Firestore 보안 규칙을 에뮬레이터로 검증할 수 있습니다.

```powershell
npm run test:rules
```

Firestore SDK는 공식 CDN의 고정 버전 12.19.0을 사용합니다. Firebase CLI와 규칙 테스트 도구는 개발 의존성이며 사이트에는 배포되지 않습니다.

## 검증 범위와 운영 메모

- 로컬: 유전·도감·공개 필드 테스트 7개, UI 동작 통합 테스트 1개, Firestore 보안 규칙 테스트 9개 통과. UI 통합 테스트는 DOM 환경과 모의 저장소로 동작을 확인하며 실제 OAuth 검증을 대신하지 않습니다.
- Google 실계정 OAuth, 실제 서비스에서 두 계정 간 공유, 화면 캡처는 서비스 연결 이후 최종 검증이 필요합니다.
- 도감 익명 편집은 의도된 기능입니다. 변경 이력은 되돌리기를 돕지만 봇의 대량 쓰기를 차단하지는 않습니다. 공개 운영 규모가 커지면 Firebase App Check와 별도 요청 제한을 추가하세요.
- 사진이 많아지면 Firestore에 이미지를 함께 넣는 방식 대신 별도 객체 저장소로 이전하는 것이 좋습니다. 현재 제한은 위와 같습니다.
- 초기 도감은 통용명 안내입니다. 색상·패턴의 유전은 복잡하므로, '유전 형질 아님'이라는 공동 편집 표기만으로 유전적 영향 자체가 없다고 판단하지 마세요. 출처·혈통을 확인하세요.
- 도감과 개인정보의 저장 경로·접근 규칙은 분리되어 있습니다. 도감 편집자가 다른 사람의 기록이나 Firebase 설정을 수정할 수 없습니다.

## 공식 문서

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/anonymous-auth
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
