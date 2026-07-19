# KYEOL (결) — Public Demo

KYEOL은 GIWA 위에 구축된 온체인 업무 신뢰 프로토콜입니다. 서로 모르는 글로벌 프로젝트와 검증된 지역 전문가가 운영자 없이 안전하게 계약·정산하고, 완료 기록을 온체인에 남깁니다. 첫 사용 사례는 한국어 Web3 로컬라이징입니다.

> KYEOL is an on-chain trust protocol built on GIWA, connecting global projects with verified local experts. Korean Web3 localization is the first use case.

## 이 저장소

이 저장소는 **공개 데모 프론트엔드만** 포함합니다. 전체 개발 저장소(컨트랙트·테스트·배포 스크립트)와 내부 문서는 별도 비공개로 관리합니다. 컨트랙트 소스는 아래 Blockscout 링크의 Contract 탭에서 열람할 수 있습니다.

## 데모 구성 — GIWA Sepolia (Chain ID 91342)

데모는 GIWA Sepolia와 **공식 TESTNET FAUCET** Dojang 발급자를 사용합니다. 실서비스 구성은 **UPBIT KOREA** 발급자 기준의 컨트랙트가 별도로 배포되어 소스 검증까지 완료되어 있습니다. 두 컨트랙트는 동일한 `LocalizationEscrow` 소스이며 발급자 설정만 다릅니다.

**No admin keys · Non-custodial** — 예치·승인·지급·환불·7일 무응답 확정까지 운영자 키 없이 컨트랙트 규칙으로만 집행됩니다.

| 구성 | 컨트랙트 | Blockscout |
|---|---|---|
| 데모 (이 페이지가 사용) | `0xE75b2A70bc323436A211e117Ba221EE468B208Cc` | [소스 검증 ↗](https://sepolia-explorer.giwa.io/address/0xE75b2A70bc323436A211e117Ba221EE468B208Cc) |
| 프로덕션 구성 (UPBIT KOREA 발급자) | `0x1303272F85685E32aE446298f2d413Ef92bD0b0A` | [소스 검증 ↗](https://sepolia-explorer.giwa.io/address/0x1303272F85685E32aE446298f2d413Ef92bD0b0A) |

## 실행

정적 파일이므로 빌드 없이 아무 정적 서버에 올리면 동작합니다. 사용하려면 브라우저 지갑과 GIWA Sepolia 테스트 ETH가 필요합니다(지갑 연결 시 네트워크 자동 추가). 지갑 없이도 페이지 열람은 가능합니다.

## 라이선스

`vendor/ethers.min.js`는 [ethers](https://github.com/ethers-io/ethers.js) v6.17.0이며 MIT 라이선스입니다(`vendor/ethers-LICENSE.md` 동봉). 그 외 KYEOL 데모 원본 코드에는 별도의 사용·복제·배포 라이선스를 부여하지 않습니다.
