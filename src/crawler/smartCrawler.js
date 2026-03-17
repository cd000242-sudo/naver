"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.smartCrawler = exports.SmartCrawler = void 0;
var cheerio = __importStar(require("cheerio"));
var puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
var StealthPlugin = require('puppeteer-extra-plugin-stealth');
var iconv = __importStar(require("iconv-lite"));
var naverSearchApi_js_1 = require("../naverSearchApi.js");
var browserUtils_js_1 = require("../browserUtils.js");
var advancedAutomator_js_1 = require("./advancedAutomator.js");
// Puppeteer Stealth 플러그인 적용 (봇 탐지 회피)
puppeteer_extra_1.default.use(StealthPlugin());
// ✅ 한국 사이트 인코딩 자동 감지 및 변환
// ✅ [FIX] URL 파라미터 추가 - 네이버 도메인은 강제 UTF-8
function decodeResponseWithCharset(response, url) {
    return __awaiter(this, void 0, void 0, function () {
        var contentType, charset, charsetMatch, buffer, _a, _b, previewText, metaCharsetMatch, charsetMap, normalizedCharset, text, isNaverDomain, hasKorean, hasReplacementChar, eucKrText, cp949Text;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    contentType = response.headers.get('content-type') || '';
                    charset = 'utf-8';
                    charsetMatch = contentType.match(/charset=([^\s;]+)/i);
                    if (charsetMatch) {
                        charset = charsetMatch[1].toLowerCase().replace(/['"]/g, '');
                    }
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, response.arrayBuffer()];
                case 1:
                    buffer = _b.apply(_a, [_c.sent()]);
                    previewText = buffer.toString('utf-8').substring(0, 2000);
                    metaCharsetMatch = previewText.match(/<meta[^>]*charset=["']?([^"'\s>]+)/i);
                    if (metaCharsetMatch) {
                        charset = metaCharsetMatch[1].toLowerCase();
                    }
                    charsetMap = {
                        'euc-kr': 'euc-kr',
                        'euckr': 'euc-kr',
                        'ks_c_5601-1987': 'euc-kr',
                        'korean': 'euc-kr',
                        'cp949': 'cp949',
                        'ms949': 'cp949',
                        'windows-949': 'cp949',
                        'utf-8': 'utf-8',
                        'utf8': 'utf-8',
                    };
                    normalizedCharset = charsetMap[charset] || charset;
                    // 5. 인코딩 변환
                    if (normalizedCharset !== 'utf-8' && iconv.encodingExists(normalizedCharset)) {
                        console.log("\uD83D\uDD04 \uC778\uCF54\uB529 \uBCC0\uD658: ".concat(normalizedCharset, " \u2192 UTF-8"));
                        return [2 /*return*/, iconv.decode(buffer, normalizedCharset)];
                    }
                    text = buffer.toString('utf-8');
                    isNaverDomain = url && url.includes('naver.com');
                    if (isNaverDomain) {
                        console.log('✅ 네이버 도메인 감지 → UTF-8 강제 사용 (EUC-KR 재시도 안 함)');
                        return [2 /*return*/, text];
                    }
                    hasKorean = /[가-힣]/.test(text);
                    hasReplacementChar = text.includes('\ufffd') || text.includes('');
                    if (!hasKorean || hasReplacementChar) {
                        console.log('⚠️ UTF-8 인코딩 실패, EUC-KR로 재시도...');
                        eucKrText = iconv.decode(buffer, 'euc-kr');
                        if (/[가-힣]/.test(eucKrText)) {
                            console.log('✅ EUC-KR 인코딩으로 복구 성공!');
                            return [2 /*return*/, eucKrText];
                        }
                        cp949Text = iconv.decode(buffer, 'cp949');
                        if (/[가-힣]/.test(cp949Text)) {
                            console.log('✅ CP949 인코딩으로 복구 성공!');
                            return [2 /*return*/, cp949Text];
                        }
                    }
                    return [2 /*return*/, text];
            }
        });
    });
}
var SmartCrawler = /** @class */ (function () {
    function SmartCrawler() {
        this.cache = new Map();
        this.cacheTTL = 1000 * 60 * 30;
    }
    /**
     * ✅ [신규] naver.me, brandconnect 등 리다이렉트 URL을 최종 목적지까지 추적
     * - Puppeteer로 실제 리다이렉트를 따라가서 최종 URL 반환
     * - brandconnect → smartstore 리다이렉트까지 완전히 기다림
     */
    SmartCrawler.prototype.resolveRedirectUrl = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var controller_1, timeout, response, finalUrl, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log("   \u23F3 \uCD5C\uC885 \uBAA9\uC801\uC9C0 URL \uCD94\uC801 \uC911 (Fetch Native)...");
                        controller_1 = new AbortController();
                        timeout = setTimeout(function () { return controller_1.abort(); }, 10000);
                        return [4 /*yield*/, fetch(url, {
                                method: 'GET',
                                redirect: 'follow', // Fetch가 내부적으로 Location 헤더를 자동으로 따라갑니다
                                signal: controller_1.signal,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                }
                            })];
                    case 1:
                        response = _a.sent();
                        clearTimeout(timeout);
                        finalUrl = response.url;
                        console.log("   \u2705 \uB9AC\uB2E4\uC774\uB809\uD2B8 \uAC10\uC9C0 \uC644\uB8CC. \uCD5C\uC885 \uBC18\uD658 URL: ".concat(finalUrl.substring(0, 60), "..."));
                        return [2 /*return*/, finalUrl];
                    case 2:
                        error_1 = _a.sent();
                        console.log("   \u274C \uB9AC\uB2E4\uC774\uB809\uD2B8 \uCD94\uC801 \uC911 \uC608\uC678 \uBC1C\uC0DD: ".concat(error_1.message));
                        // 실패할 경우 원본 URL 반환 (강제 진행)
                        return [2 /*return*/, url];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ✅ 쇼핑 API로 상품 정보 빠르게 가져오기
     * - brand.naver.com, smartstore.naver.com URL 지원
     * - 크롤링 대비 10-30배 빠름 (0.5초 vs 5-30초)
     */
    SmartCrawler.prototype.tryShoppingApiForProductUrl = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var decoded, productName, pathParts, koreanParts, urlObj, controller_2, timeout, response, html, titleMatch, titleText, errorPatterns, errorRegex, isErrorPage, isRedirectPage, e_1, productIdMatch, result, product, cleanTitle, content, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 10, , 11]);
                        decoded = decodeURIComponent(url);
                        productName = '';
                        pathParts = decoded.split('/').filter(function (p) { return p && !/^\d+$/.test(p) && !p.includes('?'); });
                        koreanParts = pathParts.filter(function (p) { return /[가-힣]/.test(p); });
                        if (koreanParts.length > 0) {
                            productName = koreanParts[koreanParts.length - 1].split('?')[0];
                        }
                        // 방법 2: 쿼리스트링에서 상품명 추출
                        if (!productName) {
                            urlObj = new URL(url);
                            productName = urlObj.searchParams.get('productName') ||
                                urlObj.searchParams.get('name') ||
                                urlObj.searchParams.get('query') ||
                                urlObj.searchParams.get('n_query') || // ✅ 추가: 네이버 광고 파라미터
                                urlObj.searchParams.get('nt_keyword') || // ✅ 추가: 네이버 쇼핑 파라미터
                                urlObj.searchParams.get('q') || '';
                        }
                        if (!(!productName || productName.length < 2)) return [3 /*break*/, 8];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        console.log('🔄 URL에서 상품명 추출 실패, 페이지 타이틀에서 추출 시도...');
                        controller_2 = new AbortController();
                        timeout = setTimeout(function () { return controller_2.abort(); }, 5000);
                        response = void 0;
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, fetch(url, {
                                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                                signal: controller_2.signal
                            })];
                    case 3:
                        response = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        clearTimeout(timeout);
                        return [7 /*endfinally*/];
                    case 5: return [4 /*yield*/, response.text()];
                    case 6:
                        html = _a.sent();
                        titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                        if (titleMatch && titleMatch[1]) {
                            titleText = titleMatch[1];
                            // 불필요한 접두사/접미사 제거 (네이버 전용)
                            titleText = titleText
                                .replace(/\[[^\]]+\]/g, '') // [네이버 스토어] 등 제거
                                .replace(/ : [^:]+$/, '') // 브랜드명 등 제거
                                .replace(/ \| [^|]+$/, '') // 쇼핑몰명 등 제거
                                .replace(/: 네이버 쇼핑$/, '')
                                .replace(/: 네이버 스마트스토어$/, '')
                                .trim();
                            if (titleText.length >= 2) {
                                errorPatterns = [
                                    '에러페이지', '에러', '시스템\\s*오류', '오류', '로그인이\\s*필요',
                                    '접근\\s*제한', '접근', '차단', '판매\\s*중지', '상품이\\s*존재하지',
                                    '접속이\\s*불가', '서비스\\s*접속', '페이지를\\s*찾을\\s*수',
                                    '주소가\\s*바르게', '점검\\s*중', '삭제된\\s*상품', '존재하지\\s*않',
                                    'error', 'system', 'access\\s*denied', 'not\\s*found', 'blocked',
                                    'captcha', 'security', 'verification', '404', '500'
                                ];
                                errorRegex = new RegExp(errorPatterns.join('|'), 'i');
                                isErrorPage = errorRegex.test(titleText);
                                isRedirectPage = /쿠팡|coupang|이동\s*중|잠시만\s*기다려/i.test(titleText) && titleText.length < 10;
                                if (isErrorPage || isRedirectPage) {
                                    console.log("\u26A0\uFE0F \uC5D0\uB7EC/\uB9AC\uB2E4\uC774\uB809\uD2B8 \uD398\uC774\uC9C0 \uAC10\uC9C0 (\"".concat(titleText, "\"), \uD0C0\uC774\uD2C0 \uC0AC\uC6A9 \uC548 \uD568"));
                                }
                                else {
                                    productName = titleText;
                                    console.log("\u2728 \uD398\uC774\uC9C0 \uD0C0\uC774\uD2C0\uC5D0\uC11C \uCD94\uCD9C \uC131\uACF5: \"".concat(productName, "\""));
                                }
                            }
                        }
                        return [3 /*break*/, 8];
                    case 7:
                        e_1 = _a.sent();
                        console.log('⚠️ 타이틀 추출 폴백 실패:', e_1); // 에러 내용 로깅 추가
                        return [3 /*break*/, 8];
                    case 8:
                        // ✅ [추가] 방법 4: 네이버 스토어/브랜드스토어 특화 URL 분석
                        if (!productName || productName.length < 2) {
                            if (url.includes('naver.com') && url.includes('/products/')) {
                                productIdMatch = url.match(/\/products\/(\d+)/);
                                if (productIdMatch) {
                                    console.log("\uD83D\uDCE1 \uB124\uC774\uBC84 \uC0C1\uD488 ID \uAC10\uC9C0: ".concat(productIdMatch[1], ", \uC774\uB97C \uAE30\uBC18\uC73C\uB85C \uAC80\uC0C9 \uC2DC\uB3C4"));
                                    // ID만으로는 상품명을 모르니, 검색 API 시 keyword를 ID로 할 순 없지만
                                    // 일단 크롤링으로 넘기는 게 안전함
                                }
                            }
                        }
                        if (!productName || productName.length < 2) {
                            console.log('⚠️ URL에서 상품명 추출 실패, 크롤링으로 진행');
                            return [2 /*return*/, null];
                        }
                        console.log("\uD83D\uDD0D \uC1FC\uD551 API \uAC80\uC0C9: \"".concat(productName, "\""));
                        return [4 /*yield*/, (0, naverSearchApi_js_1.searchShopping)({ query: productName, display: 3 })];
                    case 9:
                        result = _a.sent();
                        if (!result.items || result.items.length === 0) {
                            console.log('⚠️ 쇼핑 API 검색 결과 없음');
                            return [2 /*return*/, null];
                        }
                        product = result.items[0];
                        cleanTitle = (0, naverSearchApi_js_1.stripHtmlTags)(product.title);
                        content = [
                            "\uC0C1\uD488\uBA85: ".concat(cleanTitle),
                            "\uBE0C\uB79C\uB4DC: ".concat(product.brand || '정보 없음'),
                            "\uC81C\uC870\uC0AC: ".concat(product.maker || '정보 없음'),
                            "\uCD5C\uC800\uAC00: ".concat(Number(product.lprice).toLocaleString(), "\uC6D0"),
                            product.hprice ? "\uCD5C\uACE0\uAC00: ".concat(Number(product.hprice).toLocaleString(), "\uC6D0") : '',
                            "\uD310\uB9E4\uCC98: ".concat(product.mallName),
                            "\uCE74\uD14C\uACE0\uB9AC: ".concat([product.category1, product.category2, product.category3, product.category4].filter(Boolean).join(' > ')),
                        ].filter(Boolean).join('\n');
                        return [2 /*return*/, {
                                title: cleanTitle,
                                content: content,
                                meta: {
                                    price: product.lprice,
                                    brand: product.brand,
                                    mallName: product.mallName,
                                    productId: product.productId,
                                    productType: product.productType,
                                    category: [product.category1, product.category2, product.category3].filter(Boolean).join(' > '),
                                    source: 'naver_shopping_api',
                                },
                                images: product.image ? [product.image] : [],
                            }];
                    case 10:
                        error_2 = _a.sent();
                        console.log('⚠️ 쇼핑 API 오류:', error_2.message);
                        return [2 /*return*/, null];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ✅ 검색 API 폴백: 크롤링 실패 시 URL에서 키워드 추출하여 검색
     * - 블로그, 뉴스, 웹문서 API로 관련 정보 수집
     * - 크롤링 100% 실패해도 글 생성 가능
     */
    SmartCrawler.prototype.trySearchApiFallback = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var targetUrl, response, e_2, keyword, _a, blogResult, newsResult, webResult, allItems, contentParts, _i, _b, item, title, desc, error_3;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 6, , 7]);
                        targetUrl = url;
                        if (!(url.includes('coupa.ng') || url.includes('bit.ly') || url.includes('goo.gl') || url.includes('t.co'))) return [3 /*break*/, 4];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        console.log("\uD83D\uDD17 \uB2E8\uCD95 URL \uAC10\uC9C0: \uC6D0\uBCF8 \uC8FC\uC18C \uCD94\uC801 \uC911... (".concat(url, ")"));
                        return [4 /*yield*/, fetch(url, { method: 'HEAD', redirect: 'follow' })];
                    case 2:
                        response = _c.sent();
                        targetUrl = response.url;
                        console.log("\uD83D\uDCCD \uC6D0\uBCF8 \uC8FC\uC18C \uD655\uC778: ".concat(targetUrl));
                        return [3 /*break*/, 4];
                    case 3:
                        e_2 = _c.sent();
                        console.log('⚠️ URL 추적 실패, 원본 주소로 진행');
                        return [3 /*break*/, 4];
                    case 4:
                        keyword = this.extractKeywordFromUrl(targetUrl);
                        if (!keyword || keyword.length < 2) {
                            console.log('⚠️ URL에서 키워드 추출 실패');
                            return [2 /*return*/, null];
                        }
                        console.log("\uD83D\uDD0D \uAC80\uC0C9 API \uD3F4\uBC31: \"".concat(keyword, "\" \uD0A4\uC6CC\uB4DC\uB85C \uC815\uBCF4 \uC218\uC9D1 \uC911..."));
                        return [4 /*yield*/, Promise.all([
                                (0, naverSearchApi_js_1.searchBlog)({ query: keyword, display: 3 }).catch(function () { return ({ items: [] }); }),
                                (0, naverSearchApi_js_1.searchNews)({ query: keyword, display: 3 }).catch(function () { return ({ items: [] }); }),
                                (0, naverSearchApi_js_1.searchWebDoc)({ query: keyword, display: 3 }).catch(function () { return ({ items: [] }); }),
                            ])];
                    case 5:
                        _a = _c.sent(), blogResult = _a[0], newsResult = _a[1], webResult = _a[2];
                        allItems = __spreadArray(__spreadArray(__spreadArray([], blogResult.items.map(function (item) { return (__assign(__assign({}, item), { source: '블로그' })); }), true), newsResult.items.map(function (item) { return (__assign(__assign({}, item), { source: '뉴스' })); }), true), webResult.items.map(function (item) { return (__assign(__assign({}, item), { source: '웹문서' })); }), true);
                        if (allItems.length === 0) {
                            console.log('⚠️ 검색 API 결과 없음');
                            return [2 /*return*/, null];
                        }
                        contentParts = [];
                        contentParts.push("[\uD0A4\uC6CC\uB4DC: ".concat(keyword, "]"));
                        contentParts.push('');
                        for (_i = 0, _b = allItems.slice(0, 6); _i < _b.length; _i++) {
                            item = _b[_i];
                            title = (0, naverSearchApi_js_1.stripHtmlTags)(item.title || '');
                            desc = (0, naverSearchApi_js_1.stripHtmlTags)(item.description || '');
                            contentParts.push("## ".concat(title));
                            contentParts.push(desc);
                            contentParts.push("\uCD9C\uCC98: ".concat(item.source));
                            contentParts.push('');
                        }
                        console.log("\u2705 \uAC80\uC0C9 API \uD3F4\uBC31 \uC131\uACF5: ".concat(allItems.length, "\uAC1C \uACB0\uACFC \uC218\uC9D1"));
                        return [2 /*return*/, {
                                title: "".concat(keyword, " \uAD00\uB828 \uC815\uBCF4"),
                                content: contentParts.join('\n'),
                                meta: {
                                    keyword: keyword,
                                    sourceCount: allItems.length,
                                    sources: ['blog', 'news', 'webdoc'],
                                    source: 'naver_search_api_fallback',
                                },
                                images: [],
                            }];
                    case 6:
                        error_3 = _c.sent();
                        console.log('⚠️ 검색 API 폴백 오류:', error_3.message);
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * URL에서 키워드 추출
     */
    SmartCrawler.prototype.extractKeywordFromUrl = function (url) {
        try {
            var decoded = decodeURIComponent(url);
            // URL 경로에서 한글 추출
            var pathParts = decoded.split('/').filter(function (p) { return p && /[가-힣]/.test(p); });
            if (pathParts.length > 0) {
                // 가장 긴 한글 부분 사용
                var koreanPart = pathParts.reduce(function (a, b) {
                    return a.replace(/[^가-힣\s]/g, '').length > b.replace(/[^가-힣\s]/g, '').length ? a : b;
                });
                var keyword = koreanPart.split(/[?#&]/)[0].replace(/[^가-힣\s]/g, ' ').trim();
                if (keyword.length >= 2)
                    return keyword.split(/\s+/).slice(0, 3).join(' ');
            }
            // 쿼리스트링에서 키워드 추출
            var urlObj = new URL(url);
            var queryKeyword = urlObj.searchParams.get('query') ||
                urlObj.searchParams.get('q') ||
                urlObj.searchParams.get('keyword') ||
                urlObj.searchParams.get('n_query') || // ✅ 추가
                urlObj.searchParams.get('nt_keyword') || // ✅ 추가
                urlObj.searchParams.get('search');
            if (queryKeyword)
                return queryKeyword;
            // 제목/이름 파라미터 확인
            var titleParam = urlObj.searchParams.get('title') || urlObj.searchParams.get('name');
            if (titleParam)
                return titleParam;
            return '';
        }
        catch (_a) {
            return '';
        }
    };
    SmartCrawler.prototype.crawl = function (url_1) {
        return __awaiter(this, arguments, void 0, function (url, options) {
            var _a, mode, _b, maxLength, _c, timeout, _d, extractImages, startTime, cached, targetUrl, redirectedUrl, cachedFinal, e_3, shoppingSites, isProductUrl, productResult, elapsed, e_4, selectedMode, result, _e, elapsed, error_4, errorMessage, searchFallback;
            var _f;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _a = options.mode, mode = _a === void 0 ? 'auto' : _a, _b = options.maxLength, maxLength = _b === void 0 ? 15000 : _b, _c = options.timeout, timeout = _c === void 0 ? 30000 : _c, _d = options.extractImages, extractImages = _d === void 0 ? false : _d;
                        console.log('🌐 스마트 크롤링 시작:', url);
                        startTime = Date.now();
                        cached = this.getFromCache(url);
                        if (cached) {
                            console.log('💾 캐시 히트! (0.1초)');
                            return [2 /*return*/, __assign(__assign({}, cached), { mode: 'fast' })];
                        }
                        targetUrl = url;
                        if (!(url.includes('naver.me') || url.includes('brandconnect.naver.com') || url.includes('link.coupang.com') || url.includes('coupa.ng'))) return [3 /*break*/, 4];
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 3, , 4]);
                        console.log("\uD83D\uDD17 \uB2E8\uCD95/\uB9AC\uB2E4\uC774\uB809\uD2B8 URL \uAC10\uC9C0: ".concat(url.substring(0, 50), "..."));
                        console.log('   ⏳ 최종 목적지 URL 추적 중 (Puppeteer)...');
                        return [4 /*yield*/, this.resolveRedirectUrl(url)];
                    case 2:
                        redirectedUrl = _g.sent();
                        if (redirectedUrl && redirectedUrl !== url) {
                            console.log("   \u2705 \uCD5C\uC885 URL \uD655\uC778: ".concat(redirectedUrl.substring(0, 80), "..."));
                            targetUrl = redirectedUrl;
                            cachedFinal = this.getFromCache(targetUrl);
                            if (cachedFinal) {
                                console.log('💾 최종 URL 캐시 히트!');
                                return [2 /*return*/, __assign(__assign({}, cachedFinal), { mode: 'fast' })];
                            }
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        e_3 = _g.sent();
                        console.log('   ⚠️ URL 추적 실패, 원본 URL로 진행:', e_3.message);
                        return [3 /*break*/, 4];
                    case 4:
                        shoppingSites = [
                            'brand.naver.com',
                            'smartstore.naver.com',
                            'coupang.com',
                            'coupa.ng', // ✅ 쿠팡 파트너스 링크 추가
                            '11st.co.kr',
                            'gmarket.co.kr',
                            'auction.co.kr',
                            'aliexpress.com',
                            'aliexpress.co.kr',
                            'tmon.co.kr',
                            'wemakeprice.com',
                            'interpark.com',
                            'ssg.com',
                            'lotteon.com',
                            'kurly.com',
                            'shopping.naver.com',
                        ];
                        isProductUrl = shoppingSites.some(function (site) { return targetUrl.includes(site); });
                        if (!isProductUrl) return [3 /*break*/, 8];
                        console.log('🛒 쇼핑몰 URL 감지: 쇼핑 API로 빠른 처리 시도...');
                        _g.label = 5;
                    case 5:
                        _g.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, this.tryShoppingApiForProductUrl(targetUrl)];
                    case 6:
                        productResult = _g.sent();
                        if (productResult) {
                            elapsed = Date.now() - startTime;
                            console.log("\u2705 \uC1FC\uD551 API \uC131\uACF5! ".concat(elapsed, "ms (\uD06C\uB864\uB9C1 \uC5C6\uC774 \uC644\uB8CC)"));
                            this.saveToCache(targetUrl, productResult);
                            return [2 /*return*/, __assign(__assign({}, productResult), { mode: 'fast' })];
                        }
                        return [3 /*break*/, 8];
                    case 7:
                        e_4 = _g.sent();
                        console.log('⚠️ 쇼핑 API 실패, 크롤링으로 폴백:', e_4.message);
                        return [3 /*break*/, 8];
                    case 8:
                        selectedMode = mode === 'auto' ? this.selectMode(targetUrl) : mode;
                        // 사용자가 '비용 상관없음'을 선언했으므로, 품질을 위해 과감하게 perfect 모드 우선 적용
                        // 특히 뉴스 사이트는 standard로도 막히는 경우가 많아짐
                        if (targetUrl.includes('news') || targetUrl.includes('article')) {
                            console.log('📰 뉴스/기사 감지: 품질 확보를 위해 Perfect 모드(Puppeteer) 우선 적용');
                            selectedMode = 'perfect';
                        }
                        console.log("\uD83C\uDFAF \uC120\uD0DD\uB41C \uBAA8\uB4DC: ".concat(selectedMode));
                        _g.label = 9;
                    case 9:
                        _g.trys.push([9, 19, , 25]);
                        _e = selectedMode;
                        switch (_e) {
                            case 'fast': return [3 /*break*/, 10];
                            case 'standard': return [3 /*break*/, 12];
                            case 'perfect': return [3 /*break*/, 14];
                        }
                        return [3 /*break*/, 16];
                    case 10: return [4 /*yield*/, this.crawlFast(targetUrl, maxLength)];
                    case 11:
                        result = _g.sent();
                        return [3 /*break*/, 18];
                    case 12: return [4 /*yield*/, this.crawlStandard(targetUrl, maxLength, extractImages)];
                    case 13:
                        result = _g.sent();
                        return [3 /*break*/, 18];
                    case 14: return [4 /*yield*/, this.crawlPerfect(targetUrl, maxLength, extractImages, timeout)];
                    case 15:
                        result = _g.sent();
                        return [3 /*break*/, 18];
                    case 16: return [4 /*yield*/, this.crawlStandard(url, maxLength, extractImages)];
                    case 17:
                        result = _g.sent();
                        _g.label = 18;
                    case 18:
                        this.saveToCache(url, result);
                        elapsed = Date.now() - startTime;
                        console.log("\u2705 \uD06C\uB864\uB9C1 \uC644\uB8CC: ".concat(elapsed, "ms (\uBAA8\uB4DC: ").concat(selectedMode, ", \uAE38\uC774: ").concat(result.content.length, "\uC790)"));
                        return [2 /*return*/, __assign(__assign({}, result), { mode: selectedMode })];
                    case 19:
                        error_4 = _g.sent();
                        errorMessage = "\u274C ".concat(selectedMode, " \uBAA8\uB4DC \uC2E4\uD328: ").concat(error_4.message);
                        console.error(errorMessage);
                        options._triedModes = options._triedModes || [];
                        options._triedModes.push(selectedMode);
                        options._errorLogs = options._errorLogs || [];
                        options._errorLogs.push(errorMessage);
                        if (!(selectedMode === 'standard' && !options._triedModes.includes('perfect'))) return [3 /*break*/, 20];
                        console.log('⚠️ Standard 실패 → Perfect 모드로 재시도 (Puppeteer)');
                        return [2 /*return*/, this.crawl(url, __assign(__assign({}, options), { mode: 'perfect' }))];
                    case 20:
                        if (!(selectedMode === 'perfect' && !options._triedModes.includes('fast'))) return [3 /*break*/, 21];
                        console.log('⚠️ Perfect 실패 → Fast 모드로 재시도 (가벼운 요청)');
                        return [2 /*return*/, this.crawl(url, __assign(__assign({}, options), { mode: 'fast' }))];
                    case 21:
                        if (!!options._triedModes.includes('searchApi')) return [3 /*break*/, 23];
                        console.log('⚠️ 모든 크롤링 실패 → 검색 API로 관련 정보 수집 시도');
                        options._triedModes.push('searchApi');
                        return [4 /*yield*/, this.trySearchApiFallback(url)];
                    case 22:
                        searchFallback = _g.sent();
                        if (searchFallback) {
                            console.log('✅ 검색 API 폴백 성공! 관련 정보로 글 생성 가능');
                            this.saveToCache(url, searchFallback);
                            return [2 /*return*/, __assign(__assign({}, searchFallback), { mode: 'fast' })];
                        }
                        _g.label = 23;
                    case 23:
                        // 검색 API도 실패하면 Standard로 마지막 시도
                        if (!options._triedModes.includes('standard')) {
                            console.log('⚠️ 검색 API도 실패 → Standard 모드로 마지막 시도');
                            return [2 /*return*/, this.crawl(url, __assign(__assign({}, options), { mode: 'standard' }))];
                        }
                        console.log('🚨 모든 폴백 전략 실패 🚨');
                        if (error_4 instanceof Error) {
                            error_4.message = "".concat(error_4.message, "\n--- \uC0C1\uC138 \uC2E4\uD328 \uC774\uB825 ---\n").concat((_f = options._errorLogs) === null || _f === void 0 ? void 0 : _f.join('\n'));
                        }
                        throw error_4;
                    case 24: return [3 /*break*/, 25];
                    case 25: return [2 /*return*/];
                }
            });
        });
    };
    SmartCrawler.prototype.selectMode = function (url) {
        var urlLower = url.toLowerCase();
        // ✅ 정적 텍스트 위주 사이트만 fast 사용
        if (urlLower.includes('wikipedia') ||
            urlLower.includes('namu.wiki') ||
            urlLower.endsWith('.txt') ||
            urlLower.endsWith('.md')) {
            return 'fast';
        }
        // ✅ JavaScript 렌더링 필요한 사이트들 (perfect 모드)
        if (urlLower.includes('notion.so') ||
            urlLower.includes('medium.com') ||
            urlLower.includes('velog.io') ||
            urlLower.includes('instagram.com') ||
            urlLower.includes('imweb.me') || // ✅ imweb 쇼핑몰
            urlLower.includes('cafe24.com') || // ✅ cafe24 쇼핑몰
            urlLower.includes('sixshop.com') || // ✅ sixshop
            urlLower.includes('shopify.com') || // ✅ Shopify
            urlLower.includes('smartstore.naver') || // ✅ 네이버 스마트스토어
            urlLower.includes('brand.naver') || // ✅ 네이버 브랜드스토어
            urlLower.includes('blog.naver') || // ✅ [2026-02-08] 네이버 블로그 (iframe CSR)
            urlLower.includes('cafe.naver') || // ✅ [2026-02-08] 네이버 카페 (iframe CSR)
            urlLower.includes('brandconnect.naver') || // ✅ [추가] 브랜드커넥트 (리다이렉트)
            urlLower.includes('naver.me') || // ✅ [추가] 네이버 단축 URL (리다이렉트)
            urlLower.includes('coupang.com') || // ✅ 쿠팡
            urlLower.includes('youtube.com') || // ✅ 유튜브
            urlLower.includes('brunch.co.kr') // ✅ 브런치
        ) {
            return 'perfect';
        }
        // 나머지는 Standard (헤더 위장 Fetch)
        return 'standard';
    };
    SmartCrawler.prototype.crawlFast = function (url, maxLength) {
        return __awaiter(this, void 0, void 0, function () {
            var controller, timeout, response, html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        controller = new AbortController();
                        timeout = setTimeout(function () { return controller.abort(); }, 5000);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 4, 5]);
                        return [4 /*yield*/, fetch(url, {
                                signal: controller.signal,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                },
                            })];
                    case 2:
                        response = _a.sent();
                        clearTimeout(timeout);
                        return [4 /*yield*/, decodeResponseWithCharset(response, url)];
                    case 3:
                        html = _a.sent();
                        // ✅ [FIX] 봇 차단(Access Denied) 감지 시 오류 발생 (정상 크롤링으로 위장 방지)
                        if (html.includes('Access Denied') || html.includes('You don\'t have permission')) {
                            throw new Error('Fast 모드도 Access Denied 차단됨');
                        }
                        return [2 /*return*/, this.parseHTML(html, maxLength)];
                    case 4:
                        clearTimeout(timeout);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    SmartCrawler.prototype.crawlStandard = function (url, maxLength, extractImages) {
        return __awaiter(this, void 0, void 0, function () {
            var controller, timeout, agents, ua, response, html;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        controller = new AbortController();
                        timeout = setTimeout(function () { return controller.abort(); }, 10000);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 4, 5]);
                        agents = [
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        ];
                        ua = agents[Math.floor(Math.random() * agents.length)];
                        return [4 /*yield*/, fetch(url, {
                                signal: controller.signal,
                                headers: {
                                    'User-Agent': ua,
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                                    'Cache-Control': 'no-cache',
                                    'Pragma': 'no-cache',
                                    'Upgrade-Insecure-Requests': '1',
                                    'Sec-Fetch-Dest': 'document',
                                    'Sec-Fetch-Mode': 'navigate',
                                    'Sec-Fetch-Site': 'none',
                                    'Sec-Fetch-User': '?1',
                                },
                            })];
                    case 2:
                        response = _a.sent();
                        clearTimeout(timeout);
                        return [4 /*yield*/, decodeResponseWithCharset(response, url)];
                    case 3:
                        html = _a.sent();
                        // ✅ [FIX] 봇 차단(Access Denied) 감지 시 오류 발생
                        if (html.includes('Access Denied') || html.includes('You don\'t have permission')) {
                            throw new Error('Standard 모드도 Access Denied 차단됨');
                        }
                        return [2 /*return*/, this.parseHTMLAdvanced(html, maxLength, extractImages)];
                    case 4:
                        clearTimeout(timeout);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    SmartCrawler.prototype.crawlPerfect = function (url, maxLength, extractImages, timeout) {
        return __awaiter(this, void 0, void 0, function () {
            var crawlUrl, isSmartStore, isBrandStore, isCoupang, browser, _a, _b, _c, page, result, error_5;
            var _d;
            var _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        console.log('🚀 Puppeteer(Stealth) 실행 (JavaScript 렌더링)', extractImages ? '+ 이미지 추출' : '');
                        crawlUrl = url;
                        isSmartStore = url.includes('smartstore.naver.com') && !url.includes('m.smartstore.naver.com');
                        isBrandStore = url.includes('brand.naver.com') && !url.includes('m.brand.naver.com');
                        isCoupang = url.includes('coupang.com') || url.includes('coupa.ng');
                        if (isSmartStore) {
                            crawlUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
                            console.log("[\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4] \uD83D\uDCF1 \uBAA8\uBC14\uC77C URL\uB85C \uBCC0\uD658: ".concat(crawlUrl.substring(0, 60), "..."));
                        }
                        else if (isBrandStore) {
                            // ✅ 브랜드스토어도 모바일 버전 사용 (더 빠름)
                            crawlUrl = url.replace('brand.naver.com', 'm.brand.naver.com');
                            console.log("[\uBE0C\uB79C\uB4DC\uC2A4\uD1A0\uC5B4] \uD83D\uDCF1 \uBAA8\uBC14\uC77C URL\uB85C \uBCC0\uD658: ".concat(crawlUrl.substring(0, 60), "..."));
                        }
                        if (!isCoupang) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.crawlCoupangWithPlaywright(crawlUrl, maxLength, extractImages, timeout)];
                    case 1: return [2 /*return*/, _f.sent()];
                    case 2:
                        if (!(isSmartStore || isBrandStore)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.crawlNaverWithPlaywright(crawlUrl, maxLength, extractImages, timeout)];
                    case 3: return [2 /*return*/, _f.sent()];
                    case 4:
                        _b = (_a = puppeteer_extra_1.default).launch;
                        _d = {
                            headless: true,
                            args: [
                                '--no-sandbox',
                                '--disable-setuid-sandbox',
                                '--disable-gpu',
                                '--disable-dev-shm-usage',
                                '--disable-extensions',
                                '--disable-background-networking',
                                '--disable-sync',
                                '--disable-translate',
                                '--no-first-run',
                                '--mute-audio',
                            ]
                        };
                        _c = process.env.PUPPETEER_EXECUTABLE_PATH;
                        if (_c) return [3 /*break*/, 6];
                        return [4 /*yield*/, (0, browserUtils_js_1.getChromiumExecutablePath)()];
                    case 5:
                        _c = (_f.sent());
                        _f.label = 6;
                    case 6: return [4 /*yield*/, _b.apply(_a, [(
                            // @ts-ignore
                            _d.executablePath = _c,
                                _d)])];
                    case 7:
                        browser = _f.sent();
                        _f.label = 8;
                    case 8:
                        _f.trys.push([8, 20, , 22]);
                        return [4 /*yield*/, browser.newPage()];
                    case 9:
                        page = _f.sent();
                        if (!(isSmartStore || isBrandStore)) return [3 /*break*/, 12];
                        return [4 /*yield*/, page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')];
                    case 10:
                        _f.sent();
                        return [4 /*yield*/, page.setViewport({ width: 390, height: 844 })];
                    case 11:
                        _f.sent();
                        return [3 /*break*/, 14];
                    case 12: return [4 /*yield*/, page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')];
                    case 13:
                        _f.sent();
                        _f.label = 14;
                    case 14: 
                    // ✅ 리소스 차단 (속도 최적화)
                    return [4 /*yield*/, page.setRequestInterception(true)];
                    case 15:
                        // ✅ 리소스 차단 (속도 최적화)
                        _f.sent();
                        page.on('request', function (req) {
                            var type = req.resourceType();
                            // 이미지 추출 모드가 아니면 이미지 차단
                            if (!extractImages && type === 'image') {
                                req.abort();
                            }
                            else if (['font', 'media'].includes(type)) {
                                req.abort();
                            }
                            else {
                                req.continue();
                            }
                        });
                        return [4 /*yield*/, page.goto(crawlUrl, {
                                waitUntil: 'networkidle2',
                                timeout: timeout,
                            })];
                    case 16:
                        _f.sent();
                        // 페이지 로딩 대기 (✅ 2초 → 1초)
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 17:
                        // 페이지 로딩 대기 (✅ 2초 → 1초)
                        _f.sent();
                        return [4 /*yield*/, page.evaluate(function (shouldExtractImages) {
                                var _a, _b, _c, _d, _e;
                                // 노이즈 선택자 (여기가 핵심)
                                // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 특화 노이즈 셀렉터 대폭 강화
                                var noiseSelectors = [
                                    // 기본 노이즈
                                    'header', 'footer', 'nav', 'aside',
                                    'script', 'style', 'noscript', 'iframe',
                                    '.ad', '.ads', '.advertisement', '.banner',
                                    '#header', '#footer', '#nav', '#gnb', '#lnb',
                                    '.comment', '.comments', '#comments',
                                    '.related', '.related-news', '.popular-news', '.related_article', // 관련 기사 강력 제거
                                    '.sidebar', '.right-box', '.left-box', '.article-sidebar',
                                    '.menu', '.gnb', '.lnb',
                                    '.popup', '.modal', '.cookie-consent',
                                    '.copyright', '.btn-area', '.share-area',
                                    '.login', '.signup', '.auth',
                                    // ✅ [2026-01-24 FIX] 네이버 스포츠 특화 노이즈 셀렉터
                                    '.ranking_list', '.ranking_area', '.ranking', // 실시간 순위
                                    '.popular_area', '.hot_issue', '.hot_news', // 인기 기사
                                    '.news_list', '.article_list', '.list_area', // 다른 기사 목록
                                    '.recommend_area', '.recommend', '.suggested', // 추천 기사
                                    '.more_news', '.other_news', '.related_list', // 더보기 기사
                                    '.reporter_area', '.byline', '.author_info', // 기자 정보
                                    '.subscribe_area', '.journalist', // 구독 영역
                                    '.sports_report', '.liverank', // 스포츠 실시간
                                    '.aside_wrap', '.sub_content', '.aside_g', // 서브 콘텐츠
                                    '.end_btn', '.end_ad', '.article_end', // 기사 끝 광고
                                    '[class*="recommend"]', '[class*="popular"]', // 클래스명에 포함된 경우
                                    '[class*="ranking"]', '[class*="related"]',
                                    '[class*="other_news"]', '[class*="more_"]'
                                ];
                                var title = ((_a = document.querySelector('meta[property="og:title"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) ||
                                    ((_b = document.querySelector('title')) === null || _b === void 0 ? void 0 : _b.textContent) ||
                                    '';
                                var description = ((_c = document.querySelector('meta[property="og:description"]')) === null || _c === void 0 ? void 0 : _c.getAttribute('content')) ||
                                    ((_d = document.querySelector('meta[name="description"]')) === null || _d === void 0 ? void 0 : _d.getAttribute('content')) ||
                                    '';
                                // 노이즈 제거 (Display None 처리)
                                // 전체 문서에서 노이즈를 먼저 찾아서 숨김
                                document.querySelectorAll(noiseSelectors.join(',')).forEach(function (el) {
                                    el.style.display = 'none';
                                });
                                // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 전용 본문 셀렉터 우선 적용
                                var content = '';
                                var naverSportsArticle = document.querySelector('#newsEndContents, .news_end, .article_body, ._article_content, .newsct_article, #dic_area, .article_view');
                                var article = document.querySelector('article');
                                var mainContent = document.querySelector('#main-content, .post-content, .article-content, .view_content, .news_view, #articleBody, .article_body, .contents_view');
                                var main = document.querySelector('main');
                                // ✅ 네이버 뉴스/스포츠 본문을 최우선으로 사용
                                var targetElement = naverSportsArticle || article || mainContent || main || document.body;
                                if (targetElement) {
                                    // 본문 내에서도 혹시 남아있는 노이즈 다시 확인
                                    targetElement.querySelectorAll(noiseSelectors.join(',')).forEach(function (el) {
                                        el.style.display = 'none';
                                    });
                                    content = targetElement.textContent || '';
                                }
                                // ✅ 이미지 추출
                                var images = [];
                                if (shouldExtractImages) {
                                    var imgElements = document.querySelectorAll('img');
                                    imgElements.forEach(function (img) {
                                        // 숨겨진 이미지는 제외
                                        if (img.offsetParent === null)
                                            return;
                                        var src = img.src || img.getAttribute('data-src') || '';
                                        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                                            var width = img.naturalWidth || img.width || 0;
                                            var height = img.naturalHeight || img.height || 0;
                                            if ((width >= 200 && height >= 200) || (width === 0 && height === 0)) {
                                                images.push(src);
                                            }
                                        }
                                    });
                                    var ogImage = (_e = document.querySelector('meta[property="og:image"]')) === null || _e === void 0 ? void 0 : _e.getAttribute('content');
                                    if (ogImage && ogImage.startsWith('http')) {
                                        images.unshift(ogImage);
                                    }
                                }
                                return {
                                    title: title.trim(),
                                    content: content.trim(),
                                    meta: { description: description },
                                    images: images.slice(0, 20),
                                };
                            }, extractImages)];
                    case 18:
                        result = _f.sent();
                        return [4 /*yield*/, browser.close()];
                    case 19:
                        _f.sent();
                        result.content = this.cleanText(result.content);
                        result.content = result.content.slice(0, maxLength);
                        console.log("\u2705 Perfect \uBAA8\uB4DC \uC644\uB8CC: ".concat(((_e = result.images) === null || _e === void 0 ? void 0 : _e.length) || 0, "\uAC1C \uC774\uBBF8\uC9C0 \uBC1C\uACAC"));
                        return [2 /*return*/, result];
                    case 20:
                        error_5 = _f.sent();
                        return [4 /*yield*/, browser.close()];
                    case 21:
                        _f.sent();
                        throw error_5;
                    case 22: return [2 /*return*/];
                }
            });
        });
    };
    SmartCrawler.prototype.parseHTML = function (html, maxLength) {
        var $ = cheerio.load(html);
        // ✅ 노이즈 제거
        $('script, style, iframe, noscript, header, footer, nav, aside, .ad, .ads, .comment, .related-news, .sidebar').remove();
        var title = $('meta[property="og:title"]').attr('content') ||
            $('title').text() ||
            '';
        var description = $('meta[property="og:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') ||
            '';
        var content = '';
        var article = $('article').text();
        if (article.length > 200) {
            content = article;
        }
        else {
            var main = $('main').text();
            if (main.length > 200) {
                content = main;
            }
            else {
                content = $('body').text();
            }
        }
        content = this.cleanText(content).slice(0, maxLength);
        return {
            title: title.slice(0, 100),
            content: content,
            meta: { description: description.slice(0, 200) },
        };
    };
    SmartCrawler.prototype.parseHTMLAdvanced = function (html, maxLength, extractImages) {
        var $ = cheerio.load(html);
        // ✅ [2026-01-24 FIX] 강력한 노이즈 제거: 네이버 스포츠/뉴스 특화 셀렉터 포함
        var noiseSelectors = [
            'script', 'style', 'iframe', 'noscript',
            'header', 'footer', 'nav', 'aside',
            '.ad', '.ads', '.advertisement', '.banner',
            '#header', '#footer', '#nav',
            '.comment', '.comments', '#comments',
            '.related', '.related-news', '.popular-news', '.related_article',
            '.sidebar', '.right-box', '.left-box',
            '.menu', '.gnb', '.lnb',
            '.popup', '.modal', '.cookie-consent',
            '.copyright', '.btn-area', '.share-area',
            '.login', '.signup', '.auth',
            // ✅ 네이버 스포츠/뉴스 특화 노이즈
            '.ranking_list', '.ranking_area', '.ranking',
            '.popular_area', '.hot_issue', '.hot_news',
            '.news_list', '.article_list', '.list_area',
            '.recommend_area', '.recommend', '.suggested',
            '.more_news', '.other_news', '.related_list',
            '.reporter_area', '.byline', '.author_info',
            '.subscribe_area', '.journalist',
            '.sports_report', '.liverank',
            '.aside_wrap', '.sub_content', '.aside_g',
            '.end_btn', '.end_ad', '.article_end',
            '[class*="recommend"]', '[class*="popular"]',
            '[class*="ranking"]', '[class*="related"]',
            '[class*="other_news"]', '[class*="more_"]'
        ];
        $(noiseSelectors.join(',')).remove();
        var title = $('meta[property="og:title"]').attr('content') ||
            $('title').text() ||
            '';
        var description = $('meta[property="og:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') ||
            '';
        var content = '';
        // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 전용 본문 셀렉터 최우선
        var naverSportsArticle = $('#newsEndContents, .news_end, .article_body, ._article_content, .newsct_article, #dic_area, .article_view');
        // 1순위: article 태그
        var article = $('article');
        // 2순위: 본문 컨테이닝 요소 (일반적인 클래스명)
        var mainContent = $('#main-content, .post-content, .article-content, .view_content, .news_view, #articleBody, .article_body, .contents_view');
        // ✅ 네이버 뉴스/스포츠 본문 최우선
        var target = naverSportsArticle.length ? naverSportsArticle : (article.length ? article : (mainContent.length ? mainContent : $('main')));
        if (!target.length)
            target = $('body');
        if (target.length) {
            var paragraphs_1 = [];
            target.find('p, h1, h2, h3, h4, li, div').each(function (i, elem) {
                if (elem.tagName === 'div' && $(elem).children().length > 5)
                    return; // 컨테이너 제외
                var text = $(elem).text().trim();
                // 10글자 미만은 노이즈일 확률 높음 (단, h태그는 허용)
                var isHeader = /^h[1-6]$/i.test(elem.tagName);
                if (text.length > 10 || (isHeader && text.length > 2)) {
                    paragraphs_1.push(text);
                }
            });
            content = paragraphs_1.join('\n\n');
        }
        if (!content || content.length < 200) {
            content = $('body').text();
        }
        content = this.cleanText(content).slice(0, maxLength);
        var images = [];
        if (extractImages) {
            var ogImage = $('meta[property="og:image"]').attr('content');
            if (ogImage && ogImage.startsWith('http')) {
                images.push(ogImage);
            }
            $('img').each(function (i, elem) {
                // ... (이미지 추출 로직 유지)
                var src = $(elem).attr('src') || $(elem).attr('data-src') || '';
                if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                    images.push(src);
                }
            });
            images = __spreadArray([], new Set(images), true).slice(0, 20);
        }
        return {
            title: title.slice(0, 100),
            content: content,
            meta: { description: description.slice(0, 200) },
            images: extractImages ? images : undefined,
        };
    };
    /**
     * ✅ [개발자 전용 우회] 쿠팡 3단계 폴백 전략
     * 1단계: 모바일 API (m.coupang.com) - 봇 차단 약함
     * 2단계: OG 메타태그 추출 (최소한의 정보)
     * 3단계: Playwright + Stealth (headless: false)
     */
    SmartCrawler.prototype.crawlCoupangWithPlaywright = function (url, maxLength, extractImages, timeout) {
        return __awaiter(this, void 0, void 0, function () {
            var mobileResult, e_5, ogResult, e_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🔥 [쿠팡] 3단계 폴백 전략 시작...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        console.log('[쿠팡] 📱 1단계: 모바일 페이지 시도 (m.coupang.com)');
                        return [4 /*yield*/, this.crawlCoupangMobile(url, extractImages)];
                    case 2:
                        mobileResult = _a.sent();
                        if (mobileResult && mobileResult.title && mobileResult.title.length > 5) {
                            console.log("[\uCFE0\uD321] \u2705 \uBAA8\uBC14\uC77C \uD398\uC774\uC9C0 \uC131\uACF5: ".concat(mobileResult.title.substring(0, 30), "..."));
                            mobileResult.content = this.cleanText(mobileResult.content || '').slice(0, maxLength);
                            return [2 /*return*/, mobileResult];
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        e_5 = _a.sent();
                        console.log('[쿠팡] ⚠️ 모바일 페이지 실패:', e_5.message);
                        return [3 /*break*/, 4];
                    case 4:
                        _a.trys.push([4, 6, , 7]);
                        console.log('[쿠팡] 🏷️ 2단계: OG 메타태그 추출 시도');
                        return [4 /*yield*/, this.crawlCoupangOG(url, extractImages)];
                    case 5:
                        ogResult = _a.sent();
                        if (ogResult && ogResult.title && ogResult.title.length > 5) {
                            console.log("[\uCFE0\uD321] \u2705 OG \uBA54\uD0C0\uD0DC\uADF8 \uC131\uACF5: ".concat(ogResult.title.substring(0, 30), "..."));
                            return [2 /*return*/, ogResult];
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        e_6 = _a.sent();
                        console.log('[쿠팡] ⚠️ OG 메타태그 실패:', e_6.message);
                        return [3 /*break*/, 7];
                    case 7:
                        // ✅ 3단계: Playwright + Stealth (최후의 수단)
                        console.log('[쿠팡] 🕵️ 3단계: Playwright + Stealth 시도 (headless: false)');
                        return [4 /*yield*/, this.crawlCoupangPlaywrightFinal(url, maxLength, extractImages, timeout)];
                    case 8: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * 쿠팡 모바일 페이지 크롤링 (m.coupang.com)
     * - 모바일 User-Agent 사용
     * - 봇 차단이 데스크톱보다 약함
     */
    SmartCrawler.prototype.crawlCoupangMobile = function (url, extractImages) {
        return __awaiter(this, void 0, void 0, function () {
            var mobileUrl, mobileUA, response, html, $, title, description, price, images, ogImage, content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mobileUrl = url;
                        if (url.includes('www.coupang.com')) {
                            mobileUrl = url.replace('www.coupang.com', 'm.coupang.com');
                        }
                        else if (!url.includes('m.coupang.com')) {
                            mobileUrl = url.replace('coupang.com', 'm.coupang.com');
                        }
                        mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
                        return [4 /*yield*/, fetch(mobileUrl, {
                                headers: {
                                    'User-Agent': mobileUA,
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                    'Accept-Language': 'ko-KR,ko;q=0.9',
                                    'Accept-Encoding': 'gzip, deflate, br',
                                    'Connection': 'keep-alive',
                                    'Upgrade-Insecure-Requests': '1',
                                    'Sec-Fetch-Dest': 'document',
                                    'Sec-Fetch-Mode': 'navigate',
                                    'Sec-Fetch-Site': 'none',
                                },
                                redirect: 'follow',
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("\uBAA8\uBC14\uC77C \uD398\uC774\uC9C0 \uC751\uB2F5 \uC624\uB958: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.text()];
                    case 2:
                        html = _a.sent();
                        // Access Denied 체크
                        if (html.includes('Access Denied') || html.includes('차단') || html.includes('robot')) {
                            throw new Error('모바일 페이지도 Access Denied');
                        }
                        $ = cheerio.load(html);
                        title = $('meta[property="og:title"]').attr('content') ||
                            $('.prod-buy-header__title').text() ||
                            $('title').text() || '';
                        description = $('meta[property="og:description"]').attr('content') ||
                            $('meta[name="description"]').attr('content') || '';
                        price = $('.total-price strong').text() ||
                            $('.prod-sale-price').text() ||
                            $('[class*="price"]').first().text() || '';
                        images = [];
                        if (extractImages) {
                            ogImage = $('meta[property="og:image"]').attr('content');
                            if (ogImage)
                                images.push(ogImage);
                            $('img[src*="thumbnail"], img[src*="product"], .prod-image img').each(function (i, elem) {
                                var src = $(elem).attr('src') || $(elem).attr('data-src');
                                if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                                    images.push(src);
                                }
                            });
                            images = __spreadArray([], new Set(images), true).slice(0, 15);
                        }
                        content = [
                            "\uC0C1\uD488\uBA85: ".concat(title),
                            price ? "\uAC00\uACA9: ".concat(price) : '',
                            description ? "\uC124\uBA85: ".concat(description) : '',
                        ].filter(Boolean).join('\n');
                        return [2 /*return*/, {
                                title: title.trim(),
                                content: content,
                                meta: { description: description, source: 'coupang_mobile' },
                                images: images,
                            }];
                }
            });
        });
    };
    /**
     * 쿠팡 OG 메타태그만 추출 (가장 가벼운 방법)
     */
    SmartCrawler.prototype.crawlCoupangOG = function (url, extractImages) {
        return __awaiter(this, void 0, void 0, function () {
            var response, html, $, title, description, ogImage, images;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetch(url, {
                            headers: {
                                'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', // 검색엔진 봇으로 위장
                                'Accept': 'text/html',
                            },
                            redirect: 'follow',
                        })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("OG \uCD94\uCD9C \uC751\uB2F5 \uC624\uB958: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.text()];
                    case 2:
                        html = _a.sent();
                        if (html.includes('Access Denied') || html.includes('차단')) {
                            throw new Error('OG 추출도 Access Denied');
                        }
                        $ = cheerio.load(html);
                        title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
                        description = $('meta[property="og:description"]').attr('content') || '';
                        ogImage = $('meta[property="og:image"]').attr('content') || '';
                        images = extractImages && ogImage ? [ogImage] : [];
                        return [2 /*return*/, {
                                title: title.trim(),
                                content: "\uC0C1\uD488\uBA85: ".concat(title, "\n").concat(description),
                                meta: { description: description, source: 'coupang_og' },
                                images: images,
                            }];
                }
            });
        });
    };
    /**
     * Playwright + Stealth 최종 시도
     */
    SmartCrawler.prototype.crawlCoupangPlaywrightFinal = function (url, maxLength, extractImages, timeout) {
        return __awaiter(this, void 0, void 0, function () {
            var browser, chromium, stealth, getChromiumExecutablePath_1, execPath, userAgents, randomUA, context, page, htmlContent, result, error_6;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        browser = null;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 22, , 25]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('playwright-extra')); })];
                    case 2:
                        chromium = (_b.sent()).chromium;
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('puppeteer-extra-plugin-stealth')); })];
                    case 3:
                        stealth = (_b.sent()).default;
                        chromium.use(stealth());
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('../browserUtils.js')); })];
                    case 4:
                        getChromiumExecutablePath_1 = (_b.sent()).getChromiumExecutablePath;
                        return [4 /*yield*/, getChromiumExecutablePath_1()];
                    case 5:
                        execPath = _b.sent();
                        console.log("[\uCFE0\uD321] \uD83D\uDD75\uFE0F Playwright Stealth \uBAA8\uB4DC\uB85C \uCFE0\uD321 \uD06C\uB864\uB9C1 \uC2DC\uC791... (execPath: ".concat(execPath || 'default', ")"));
                        return [4 /*yield*/, chromium.launch(__assign(__assign({ headless: false }, (execPath ? { executablePath: execPath } : {})), { args: [
                                    '--disable-blink-features=AutomationControlled',
                                    '--disable-dev-shm-usage',
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--disable-web-security',
                                    '--disable-features=IsolateOrigins,site-per-process',
                                    '--window-size=1920,1080',
                                ] }))];
                    case 6:
                        browser = _b.sent();
                        userAgents = [
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        ];
                        randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
                        return [4 /*yield*/, browser.newContext({
                                viewport: { width: 1920, height: 1080 },
                                userAgent: randomUA,
                                locale: 'ko-KR',
                                timezoneId: 'Asia/Seoul',
                                permissions: ['geolocation'],
                                geolocation: { latitude: 37.5665, longitude: 126.9780 },
                                colorScheme: 'light',
                                extraHTTPHeaders: {
                                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                                    'Sec-Fetch-Dest': 'document',
                                    'Sec-Fetch-Mode': 'navigate',
                                    'Sec-Fetch-Site': 'none',
                                    'Sec-Fetch-User': '?1',
                                },
                            })];
                    case 7:
                        context = _b.sent();
                        return [4 /*yield*/, context.newPage()];
                    case 8:
                        page = _b.sent();
                        // ⭐ CDP 레벨 속성 조작 (핵심!)
                        return [4 /*yield*/, page.addInitScript(function () {
                                Object.defineProperty(navigator, 'webdriver', { get: function () { return undefined; } });
                                window.chrome = { runtime: {}, loadTimes: function () { }, csi: function () { }, app: {} };
                                Object.defineProperty(navigator, 'plugins', {
                                    get: function () { return [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }]; },
                                });
                            })];
                    case 9:
                        // ⭐ CDP 레벨 속성 조작 (핵심!)
                        _b.sent();
                        // 🔄 1단계: 쿠팡 메인 페이지 먼저 방문 (쿠키 생성)
                        console.log('[쿠팡] 🏠 쿠팡 메인 페이지 방문 중...');
                        return [4 /*yield*/, page.goto('https://www.coupang.com', { waitUntil: 'domcontentloaded', timeout: 30000 })];
                    case 10:
                        _b.sent();
                        // 인간처럼 행동
                        return [4 /*yield*/, page.mouse.move(500, 300)];
                    case 11:
                        // 인간처럼 행동
                        _b.sent();
                        return [4 /*yield*/, page.waitForTimeout(1500 + Math.random() * 1500)];
                    case 12:
                        _b.sent();
                        return [4 /*yield*/, page.mouse.wheel(0, 300)];
                    case 13:
                        _b.sent();
                        return [4 /*yield*/, page.waitForTimeout(800 + Math.random() * 700)];
                    case 14:
                        _b.sent();
                        // 🎯 2단계: 상품 페이지 접근
                        console.log("[\uCFE0\uD321] \uD83C\uDFAF \uC0C1\uD488 \uD398\uC774\uC9C0 \uC774\uB3D9... (".concat(url, ")"));
                        return [4 /*yield*/, page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout })];
                    case 15:
                        _b.sent();
                        return [4 /*yield*/, page.waitForTimeout(2000 + Math.random() * 1500)];
                    case 16:
                        _b.sent();
                        return [4 /*yield*/, page.content()];
                    case 17:
                        htmlContent = _b.sent();
                        if (!(htmlContent.includes('Access Denied') || htmlContent.includes('차단'))) return [3 /*break*/, 19];
                        console.log('[쿠팡] ❌ Access Denied 발생');
                        return [4 /*yield*/, page.screenshot({ path: 'coupang_blocked_stealth.png', fullPage: true })];
                    case 18:
                        _b.sent();
                        throw new Error('Playwright(Stealth) Access Denied');
                    case 19:
                        console.log('[쿠팡] ✅ 페이지 접근 성공! 데이터 추출 중...');
                        return [4 /*yield*/, page.evaluate(function (shouldExtractImages) {
                                var _a, _b, _c, _d, _e, _f;
                                var title = ((_a = document.querySelector('meta[property="og:title"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) ||
                                    ((_b = document.querySelector('.prod-buy-header__title')) === null || _b === void 0 ? void 0 : _b.textContent) ||
                                    ((_c = document.querySelector('title')) === null || _c === void 0 ? void 0 : _c.textContent) || '';
                                var description = ((_d = document.querySelector('meta[property="og:description"]')) === null || _d === void 0 ? void 0 : _d.getAttribute('content')) || '';
                                var content = ((_e = document.querySelector('.prod-buy-header, .prod-atf, article, main')) === null || _e === void 0 ? void 0 : _e.textContent) || document.body.textContent || '';
                                var images = [];
                                if (shouldExtractImages) {
                                    var ogImage = (_f = document.querySelector('meta[property="og:image"]')) === null || _f === void 0 ? void 0 : _f.getAttribute('content');
                                    if (ogImage)
                                        images.push(ogImage);
                                    document.querySelectorAll('.prod-image__item img, img[src*="thumbnail"]').forEach(function (img) {
                                        var src = img.src;
                                        if (src && src.startsWith('http') && !src.includes('logo')) {
                                            images.push(src);
                                        }
                                    });
                                    images = __spreadArray([], new Set(images), true).slice(0, 15);
                                }
                                return { title: title.trim(), content: content.trim(), meta: { description: description }, images: images };
                            }, extractImages)];
                    case 20:
                        result = _b.sent();
                        return [4 /*yield*/, browser.close()];
                    case 21:
                        _b.sent();
                        result.content = this.cleanText(result.content || '').slice(0, maxLength);
                        console.log("[\uCFE0\uD321] \u2705 Playwright \uC131\uACF5: ".concat((_a = result.title) === null || _a === void 0 ? void 0 : _a.substring(0, 30), "..."));
                        return [2 /*return*/, result];
                    case 22:
                        error_6 = _b.sent();
                        console.error('[쿠팡] ❌ Playwright 실패:', error_6.message);
                        if (!browser) return [3 /*break*/, 24];
                        return [4 /*yield*/, browser.close()];
                    case 23:
                        _b.sent();
                        _b.label = 24;
                    case 24: throw error_6;
                    case 25: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ✅ [NEW] 네이버 스마트스토어/브랜드스토어 전용 Playwright + Stealth 크롤러
     * - headless: false (실제 브라우저)
     * - 네이버도 봇 차단 강화 중이므로 Stealth 사용
     */
    SmartCrawler.prototype.crawlNaverWithPlaywright = function (url, maxLength, extractImages, timeout) {
        return __awaiter(this, void 0, void 0, function () {
            var browser, context, chromium, stealth, userDataDir, execPath, execPath2, page, e_7, automator, htmlContent, result, error_7;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log('🕵️ [네이버] Playwright + Stealth 모드 실행 (headless: false)');
                        browser = null;
                        context = null;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 31, , 36]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('playwright-extra')); })];
                    case 2:
                        chromium = (_c.sent()).chromium;
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('puppeteer-extra-plugin-stealth')); })];
                    case 3:
                        stealth = (_c.sent()).default;
                        chromium.use(stealth());
                        userDataDir = process.env.LOCALAPPDATA
                            ? "".concat(process.env.LOCALAPPDATA, "\\Google\\Chrome\\User Data")
                            : process.env.HOME
                                ? "".concat(process.env.HOME, "/Library/Application Support/Google/Chrome")
                                : null;
                        if (!userDataDir) return [3 /*break*/, 6];
                        console.log('[네이버] 🍪 사용자 Chrome 프로필 사용 (CAPTCHA 우회)');
                        return [4 /*yield*/, (0, browserUtils_js_1.getChromiumExecutablePath)()];
                    case 4:
                        execPath = _c.sent();
                        return [4 /*yield*/, chromium.launchPersistentContext(userDataDir, {
                                headless: false,
                                executablePath: execPath || undefined,
                                args: [
                                    '--disable-blink-features=AutomationControlled',
                                    '--disable-dev-shm-usage',
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--window-size=1920,1080',
                                    '--profile-directory=Default',
                                ],
                                viewport: { width: 1920, height: 1080 },
                                locale: 'ko-KR',
                                timezoneId: 'Asia/Seoul',
                            })];
                    case 5:
                        context = _c.sent();
                        return [3 /*break*/, 10];
                    case 6:
                        console.log('[네이버] 🔄 새 브라우저 세션 사용');
                        return [4 /*yield*/, (0, browserUtils_js_1.getChromiumExecutablePath)()];
                    case 7:
                        execPath2 = _c.sent();
                        return [4 /*yield*/, chromium.launch({
                                headless: false,
                                executablePath: execPath2 || undefined,
                                args: [
                                    '--disable-blink-features=AutomationControlled',
                                    '--disable-dev-shm-usage',
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--window-size=1920,1080',
                                ],
                            })];
                    case 8:
                        browser = _c.sent();
                        return [4 /*yield*/, browser.newContext({
                                viewport: { width: 1920, height: 1080 },
                                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                locale: 'ko-KR',
                                timezoneId: 'Asia/Seoul',
                                extraHTTPHeaders: {
                                    'Accept-Language': 'ko-KR,ko;q=0.9',
                                },
                            })];
                    case 9:
                        context = _c.sent();
                        _c.label = 10;
                    case 10: return [4 /*yield*/, context.newPage()];
                    case 11:
                        page = _c.sent();
                        return [4 /*yield*/, page.addInitScript(function () {
                                Object.defineProperty(navigator, 'webdriver', { get: function () { return undefined; } });
                                window.chrome = { runtime: {}, loadTimes: function () { }, csi: function () { }, app: {} };
                            })];
                    case 12:
                        _c.sent();
                        console.log('[네이버] 🎯 상품 페이지 로딩...');
                        return [4 /*yield*/, page.goto(url, { waitUntil: 'networkidle', timeout: timeout })];
                    case 13:
                        _c.sent();
                        // ⭐ SPA 동적 렌더링 대기: 상품명이 나타날 때까지 기다림
                        console.log('[네이버] ⏳ 상품 정보 렌더링 대기...');
                        _c.label = 14;
                    case 14:
                        _c.trys.push([14, 16, , 17]);
                        return [4 /*yield*/, page.waitForSelector('._1eddO7u4UC, ._3zzFY_wgQ6, .product-title, [class*="ProductName"], h1._2F0p2I6kQb', {
                                timeout: 10000,
                            })];
                    case 15:
                        _c.sent();
                        return [3 /*break*/, 17];
                    case 16:
                        e_7 = _c.sent();
                        console.log('[네이버] ⚠️ 상품명 셀렉터 타임아웃, 추가 대기...');
                        return [3 /*break*/, 17];
                    case 17:
                        automator = new advancedAutomator_js_1.AdvancedAutomator();
                        return [4 /*yield*/, automator.attach(context, page)];
                    case 18:
                        _c.sent();
                        // 인간처럼 행동 - 제목 부위로 스와이프/스크롤 후 잠시 응시
                        return [4 /*yield*/, automator.organicScrollTo('._1eddO7u4UC, ._3zzFY_wgQ6, .product-title, [class*="ProductName"]')];
                    case 19:
                        // 인간처럼 행동 - 제목 부위로 스와이프/스크롤 후 잠시 응시
                        _c.sent();
                        return [4 /*yield*/, automator.randomWait(2000, 800)];
                    case 20:
                        _c.sent();
                        return [4 /*yield*/, page.content()];
                    case 21:
                        htmlContent = _c.sent();
                        if (!(htmlContent.includes('에러페이지') || htmlContent.includes('시스템오류'))) return [3 /*break*/, 25];
                        console.log('[네이버] ⚠️ 에러 페이지 감지, 대기 후 재시도...');
                        return [4 /*yield*/, page.waitForTimeout(3000)];
                    case 22:
                        _c.sent();
                        return [4 /*yield*/, page.reload({ waitUntil: 'networkidle' })];
                    case 23:
                        _c.sent();
                        return [4 /*yield*/, page.waitForTimeout(3000)];
                    case 24:
                        _c.sent();
                        _c.label = 25;
                    case 25: return [4 /*yield*/, page.evaluate(function (shouldExtractImages) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
                            // ⭐ 네이버 스마트스토어 상품명 셀렉터 (다양한 패턴)
                            var title = ((_a = document.querySelector('._1eddO7u4UC')) === null || _a === void 0 ? void 0 : _a.textContent) ||
                                ((_b = document.querySelector('._3zzFY_wgQ6')) === null || _b === void 0 ? void 0 : _b.textContent) ||
                                ((_c = document.querySelector('h1._2F0p2I6kQb')) === null || _c === void 0 ? void 0 : _c.textContent) ||
                                ((_d = document.querySelector('[class*="ProductName"]')) === null || _d === void 0 ? void 0 : _d.textContent) ||
                                ((_e = document.querySelector('.product-title')) === null || _e === void 0 ? void 0 : _e.textContent) ||
                                ((_f = document.querySelector('meta[property="og:title"]')) === null || _f === void 0 ? void 0 : _f.getAttribute('content')) ||
                                ((_g = document.querySelector('title')) === null || _g === void 0 ? void 0 : _g.textContent) || '';
                            var description = ((_h = document.querySelector('meta[property="og:description"]')) === null || _h === void 0 ? void 0 : _h.getAttribute('content')) ||
                                ((_j = document.querySelector('._3DPGSjcWQn')) === null || _j === void 0 ? void 0 : _j.textContent) || '';
                            // ⭐ 가격 셀렉터 (스마트스토어)
                            var price = ((_k = document.querySelector('._1LY7DqCnwR')) === null || _k === void 0 ? void 0 : _k.textContent) ||
                                ((_l = document.querySelector('span._3BuEmd0aIP')) === null || _l === void 0 ? void 0 : _l.textContent) ||
                                ((_m = document.querySelector('._3_2HPBGP5E')) === null || _m === void 0 ? void 0 : _m.textContent) ||
                                ((_o = document.querySelector('[class*="finalPrice"]')) === null || _o === void 0 ? void 0 : _o.textContent) ||
                                ((_p = document.querySelector('[class*="sale_price"]')) === null || _p === void 0 ? void 0 : _p.textContent) || '';
                            // 본문 구성
                            var content = "\uC0C1\uD488\uBA85: ".concat(title, "\n");
                            if (price)
                                content += "\uAC00\uACA9: ".concat(price, "\n");
                            if (description)
                                content += "\uC124\uBA85: ".concat(description);
                            // ⭐ 이미지 추출 (스마트스토어)
                            var images = [];
                            if (shouldExtractImages) {
                                var ogImage = (_q = document.querySelector('meta[property="og:image"]')) === null || _q === void 0 ? void 0 : _q.getAttribute('content');
                                if (ogImage)
                                    images.push(ogImage);
                                document.querySelectorAll('._1QhSlmXi2u img, .product-image img, img[src*="pstatic"]').forEach(function (img) {
                                    var src = img.src || img.getAttribute('data-src');
                                    if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                                        images.push(src);
                                    }
                                });
                                images = __spreadArray([], new Set(images), true).slice(0, 15);
                            }
                            return {
                                title: title.trim(),
                                content: content.trim(),
                                meta: { description: description, source: 'naver_playwright' },
                                images: images,
                            };
                        }, extractImages)];
                    case 26:
                        result = _c.sent();
                        if (!context) return [3 /*break*/, 28];
                        return [4 /*yield*/, context.close()];
                    case 27:
                        _c.sent();
                        _c.label = 28;
                    case 28:
                        if (!browser) return [3 /*break*/, 30];
                        return [4 /*yield*/, browser.close()];
                    case 29:
                        _c.sent();
                        _c.label = 30;
                    case 30:
                        result.content = this.cleanText(result.content).slice(0, maxLength);
                        console.log("[\uB124\uC774\uBC84] \u2705 Playwright \uC131\uACF5: ".concat((_a = result.title) === null || _a === void 0 ? void 0 : _a.substring(0, 30), "... (\uC774\uBBF8\uC9C0 ").concat(((_b = result.images) === null || _b === void 0 ? void 0 : _b.length) || 0, "\uAC1C)"));
                        return [2 /*return*/, result];
                    case 31:
                        error_7 = _c.sent();
                        console.error('[네이버] ❌ Playwright 실패:', error_7.message);
                        if (!context) return [3 /*break*/, 33];
                        return [4 /*yield*/, context.close()];
                    case 32:
                        _c.sent();
                        _c.label = 33;
                    case 33:
                        if (!browser) return [3 /*break*/, 35];
                        return [4 /*yield*/, browser.close()];
                    case 34:
                        _c.sent();
                        _c.label = 35;
                    case 35: throw error_7;
                    case 36: return [2 /*return*/];
                }
            });
        });
    };
    SmartCrawler.prototype.cleanText = function (text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();
    };
    SmartCrawler.prototype.getFromCache = function (url) {
        var cached = this.cache.get(url);
        if (!cached)
            return null;
        if (Date.now() - cached.timestamp > this.cacheTTL) {
            this.cache.delete(url);
            return null;
        }
        return JSON.parse(cached.content);
    };
    SmartCrawler.prototype.saveToCache = function (url, data) {
        this.cache.set(url, {
            content: JSON.stringify(data),
            timestamp: Date.now(),
            // @ts-ignore
            size: data.content.length
        });
        if (this.cache.size > 50) {
            var firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
    };
    return SmartCrawler;
}());
exports.SmartCrawler = SmartCrawler;
exports.smartCrawler = new SmartCrawler();
