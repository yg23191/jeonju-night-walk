# 전주 귀갓길 조도 지도

완산구의 야간 보행 경로를 확인하고 조도계로 잰 값을 카카오 지도에 기록하는 서비스입니다. 경로에 표시되는 **예상 조도**는 가상 가로등으로 계산합니다. **현장 실측**에는 조사팀이 저장한 측정값과 프로젝트 기준에 따른 판정이 표시됩니다. [공개 지도](https://yg23191.github.io/jeonju-night-walk/) · [11월 30일 현장 조사 결정표](FIELDWORK.md)

| 실행 환경 | 실제 위치·실측 | 시민 제보 및 공식 레이어 |
| --- | --- | --- |
| GitHub Pages 공개 지도 | 카카오 지도, 보행 경로, 브라우저 실측 저장과 CSV 백업 | 현재 제보는 브라우저에 저장됩니다. 공용 제보와 키가 필요한 공식 레이어에는 별도 HTTPS API 서버가 필요합니다. |
| 로컬 Node 서버 | 공개 지도와 같은 실측 기능 | 제보를 SQLite에 저장합니다. 로컬 설정에 따라 전주시 보안등 스냅샷과 발급 승인된 공식 API를 사용할 수 있습니다. |

## 실행

Node.js 24 기준입니다. 프로젝트 폴더에서 실행합니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

터미널에 출력된 Local 주소를 브라우저에서 엽니다. 카카오 키가 설정된 경우 **실제 위치 선택 → 예시 지점 표시**에서 완산구 예시 보행 경로를 확인할 수 있습니다. **조도 분석 시연**에서 공원과 도서관을 선택하면 가상 경로 두 개를 볼 수 있습니다.

```powershell
npm.cmd test
npm.cmd run build
```

## HTTP 정적 배포

카카오 배경지도를 사용하려면 빌드 전에 `.env.local` 파일에 `VITE_KAKAO_MAP_JS_KEY`를 설정합니다. 이 값은 브라우저용 키이며 배포 번들에 포함됩니다. 도보 API 비밀 키는 Vite 환경 변수에 넣지 않습니다.

`npm.cmd run build`로 만든 `dist` 폴더의 내용을 HTTP 정적 웹서버에 올립니다. 자산은 상대 경로로 빌드되므로 하위 폴더 경로에서도 서비스할 수 있습니다. 카카오 개발자 콘솔의 해당 JavaScript 키에 실제 서비스 주소의 스킴과 호스트, 필요한 경우 포트를 등록합니다. 카카오 SDK는 HTTP 페이지에서도 HTTPS로 불러옵니다.

키를 설정한 배포본은 **실제 위치 선택** 화면으로 시작합니다. 완산구 경계 안에서 지도를 클릭하거나 장소를 검색해 출발지와 도착지를 지정합니다. 가까운 보행망에 연결되면 완산구 내부 경로와 함께 경로를 따라 생성한 임의 가로등을 표시합니다. 임의 가로등을 모델에 넣어 5 lx 미만으로 예상되는 표본을 빨간 점으로 표시합니다. 경계 40 m 이내의 불충분한 표본은 회색으로 표시합니다. 이 결과는 가상 조명 시뮬레이션입니다. **예시 지점 표시**로 동작을 확인할 수 있습니다. 선택한 좌표는 현재 화면에만 유지됩니다.

카카오 지도 레벨 3 이하에서는 저조도 표본을 개별 점으로, 더 넓은 축척에서는 서로 이어진 저조도 구간을 빨간 선으로 그립니다. 점을 클릭하면 해당 표본의 밝기, 경로 시작부터의 누적 거리, 반경 40 m 안의 임의 가로등 개수를 볼 수 있습니다. 구간을 클릭하면 그 안에서 가장 낮게 계산된 지점을 보여줍니다. 저조도 예상 거리는 5 m 간격 표본 사이 구간을 중점에서 분류한 뒤 거리로 합산합니다.

### 시민 제보와 공식 범죄주의구간

**어두운 곳 제보하기**를 눌러 공개 보행 구간을 선택하고, 장소명을 확인한 뒤 **이 위치 제보**를 누릅니다. 제보는 완산구 안에서 약 20 m 격자로 처리합니다. 검색 결과를 선택하면 등록 장소명을 사용하고, 직접 찍은 곳은 가까운 등록 장소의 인근으로 표시합니다. 확인할 이름이 없으면 이름이 등록되지 않은 지점으로 표시합니다.

Node.js 24에서 로컬 통합 화면을 실행합니다. 다른 서비스가 같은 포트를 사용 중이면 그 서비스를 종료하거나 카카오 SDK 허용 도메인과 포트를 맞춥니다.

```powershell
npm.cmd ci
npm.cmd run build
$env:PORT = '5173'
npm.cmd run serve
```

`npm.cmd run serve`는 `dist/`와 `/api/community/`를 같은 주소에서 제공합니다. 제보는 SQLite에 저장되고, 같은 서버에 연결된 브라우저들이 격자별 제보 건수를 읽습니다. 원래 클릭 좌표, 이름, 주소, 이동 경로는 제보 데이터에 저장하지 않습니다. 브라우저가 같은 격자에서 재시도할 때는 같은 제출 ID를 사용합니다. 서버의 기본 DB 파일은 `.community/reports.sqlite`이며 `COMMUNITY_DB_FILE`로 바꿀 수 있습니다.

GitHub Pages에서는 Node 서버를 별도 HTTPS 호스트에 실행하고, 지속 저장소의 DB 경로와 `COMMUNITY_ALLOWED_ORIGIN`을 설정합니다. 저장소의 Actions 변수 `VITE_COMMUNITY_API_URL`에 API 호스트의 주소를 지정한 뒤 재배포하면 공용 제보를 켤 수 있습니다. API 호스트를 설정하지 않은 Pages 빌드의 제보는 해당 브라우저에만 보관됩니다.

공식 범죄주의구간은 [생활안전지도 범죄주의구간 WMS](https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=205)의 키를 서버 환경변수 `SAFEMAP_SERVICE_KEY`에 설정해야 표시됩니다. 공공누리 제4유형으로 안내된 경찰청 밀도분석 지도이며, WMS 원본 색상과 범례 의미를 유지합니다. 공식 레이어를 켜면 기본으로 가상 조도 색상은 숨기고, 두 레이어는 각각 켜거나 끌 수 있습니다.

### 현장 실측과 전주시 조명 레이어

[현장 조사 결정표와 양식](FIELDWORK.md)을 참고하세요. **현장 실측** 메뉴에서 지도나 경도·위도로 지점을 지정한 뒤 한 번에 최대 세 측정값과 지점 이름을 입력합니다. **판정 기준과 CSV**에서 기준을 바꾸거나 다른 기기의 측정값을 가져옵니다. 브라우저에 보관한 기록은 **실측값 내보내기**로 백업합니다. 기본값은 같은 높이·방향으로 마지막 측정부터 15분 이내에 잰 값 3회 이상, 중앙값 5 lx 미만입니다. 현장 조사팀의 판정 기준입니다.

발급받은 공식 API 키는 Git에서 제외되는 `.env.local`에 저장합니다. 카카오 JavaScript 키에만 `VITE_` 변수명을 사용합니다. [전주시 가로등](https://www.data.go.kr/data/15056885/openapi.do)은 `JEONJU_STREETLAMP_API_KEY`, [전주시 보안등](https://www.data.go.kr/data/15057163/openapi.do)은 `JEONJU_SECURITY_LIGHT_API_KEY`를 사용합니다. 키를 설정한 뒤 Node 서버를 재시작하면 완료된 자료를 카카오 지도에 겹칠 수 있습니다. 완산구 경계 밖 좌표는 서버에서 제외합니다.

보안등 API를 사용할 수 없는 경우, 전주시가 [전국보안등정보표준데이터](https://www.data.go.kr/data/15017320/standard.do)에 공개한 CSV를 정리한 좌표 파일을 로컬 서버에서 사용할 수 있습니다. `JEONJU_SECURITY_LIGHT_SNAPSHOT_FILE`에 Git에서 제외되는 좌표 파일 경로를 지정합니다. 형식은 `{ "asOf": "2025-02-10", "points": [[경도, 위도], ...] }`입니다. 전주시 제공 CSV에서 관리기관이 완산구청인 2025-02-10 기록만 선택하고 완산구 경계 밖과 중복 좌표를 제외한 자료입니다. 화면에서 기준일을 확인할 수 있으며 시설 위치에 해당합니다.

### 완산구 위치 자료

| 파일 | 출처와 범위 |
| --- | --- |
| `src/wansan-boundary.json` | [vuski/admdongkor 2026-10-01](https://github.com/vuski/admdongkor/tree/master/ver20261001)의 완산구 행정동 19개를 합치고 WGS84 소수점 6자리로 변환. [통계청 SGIS](https://sgis.kostat.go.kr) 공공누리 제1유형 원자료, 가공 자료 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). |
| `public/data/wansan-buildings.json` | [Overture Maps 2026-11-18.0 Buildings](https://docs.overturemaps.org/guides/buildings/)에서 완산구와 겹치는 도형 22,604개를 경계로 잘라 소수점 6자리로 적재. © Overture Maps Foundation, OpenStreetMap contributors 및 [Buildings 원자료 기여자](https://docs.overturemaps.org/attribution/). [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). |
| `public/data/wansan-places.json` | [Overture Maps 2026-11-18.0 Places](https://docs.overturemaps.org/guides/places/)의 완산구 장소 3,940곳. 화면에 필요한 공개 이름, 분류, 좌표를 추출했습니다. [Overture 및 Places 자료 기여자와 라이선스](https://docs.overturemaps.org/attribution/). |
| `public/data/wansan-walking.json` | [OpenStreetMap](https://www.openstreetmap.org/copyright) 2026-11-24 조회, 완산구 내부 보행 가능성이 있는 도로·보행로 50,500개 선분. © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). |
| `public/data/wansan-registered-lights.json` | 같은 OSM 스냅샷에서 완산구에 등록된 `highway=street_lamp` 18개. © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). |

건물·장소 자료는 공개 데이터의 수록 범위에 따릅니다. 보행 경로는 선택 지점에서 65 m 이내의 가까운 보행망 선분에 연결한 후 A*로 계산합니다. 완산구 경계를 벗어나는 선분과 명시적으로 보행이 금지된 도로 등을 제외합니다. 이동 거리에는 지점에서 보행망 연결점까지의 직선 이격거리를 포함하지 않습니다. OSM 가로등은 조사 범위와 점등·광도 자료가 확인되지 않아 실제 조도 계산에 사용하지 않습니다.

장소 자료의 [CDLA Permissive 2.0](public/data/LICENSE-CDLA-Permissive-2.0.txt), [Apache 2.0](public/data/LICENSE-Apache-2.0.txt) 및 [Foursquare NOTICE](public/data/NOTICE-Foursquare.txt)는 배포 파일에 포함합니다.

로컬에서 빌드 결과를 확인하려면 개발 서버를 종료한 뒤 `npm.cmd exec vite -- preview --host 127.0.0.1 --port 5173 --strictPort`를 실행합니다. 카카오 허용 주소로 `http://127.0.0.1:5173`과 `http://localhost:5173`을 등록했습니다.

## 조도 분석 시연 자료와 설정

| 자료 | 현재 출처 및 범위 |
| --- | --- |
| 지도 및 분석 가능 범위 | 로컬 SVG와 시연 폴리곤. 전주 인근 좌표에 배치한 가상 지형이며 행정경계 자료는 미연결입니다. |
| 장소 및 보행 경로 | 공개 장소 유형으로 만든 가상 장소 세 곳과 등록 경로 세 개. 경로는 WGS84 GeoJSON LineString 형태로 로드합니다. |
| 가로등 및 조사 범위 | 합성 GeoJSON Point 자료와 독립 합성 조사 폴리곤. 실제 조사일, 누락률, 점등 기록은 없습니다. |
| 실측 | 실제 위치 화면의 **현장 실측** 메뉴에서 별도로 수집합니다. |

가로등 GeoJSON 형식 예시는 `{"type":"Feature","geometry":{"type":"Point","coordinates":[127.128,35.812]},"properties":{"id":"DEMO-1","source":"시연용 가상 데이터","height_m":6,"intensity_cd":300}}`입니다. WGS84 좌표는 경도, 위도 순입니다. 로더는 동일 ID의 최신 유효 레코드를 유지하고 모형은 확인된 소등과 고장 등을 제외합니다.

5 m 간격의 양 끝 포함 표본과 인접 표본 구간의 중점을 각각 계산합니다. 임계값은 기본 5 lx, 조절 범위는 1~15 lx입니다. 기본 높이 6 m와 광도 300 cd를 쓰며 상태 미확인 등은 점등을 가정합니다. 40 m 바깥의 기여를 생략하고 같은 반경의 조사 커버리지가 충분한 경우만 수치를 표시합니다. 자료 범위 안에 등록 등이 없으면 모델상 0 lx입니다. 차폐, 배광, 상가 조명, 날씨와 실시간 점등은 모델의 입력 범위 밖입니다. 저조도 구간 후보는 중점 기준으로 묶고 구간에서 가장 낮은 모델 값을 내보냅니다. CSV는 현장 확인 후보를 기록하며 실제 설치 위치는 실측과 현장 조건 확인 후 결정합니다.

## 실서비스 연결에 필요한 입력

- 카카오 지도 Web SDK JavaScript 키와 허용 도메인. 키를 설정하면 전주 실제 배경지도를 별도 화면에서 볼 수 있습니다.
- 출처와 기준일이 확인된 전주시 행정경계 GeoJSON, 조명 GeoJSON Point 또는 변환 가능한 CSV, 독립 조사 범위 폴리곤. 조명 상태와 알려진 누락을 함께 기록합니다.
- 사용할 배경지도에 표시할 권한이 확인된 도보 경로 제공자나 팀이 검증한 보행 경로 GeoJSON. 비밀 키가 필요한 경우 `WALKING_API_KEY`는 서버 환경에서 관리합니다. 현재 데모에는 키를 읽는 런타임과 운영 API 호출이 없습니다.
- 야간 실측 자료와 센서 높이·방향·시각·반복 여부. 모델 보정 지점과 평가 지점을 나눕니다.

데모는 개인 주소, 실제 아동 귀가 경로, 아동 식별 정보를 수집하거나 저장하지 않습니다.

