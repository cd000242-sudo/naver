"use strict";
/**
 * 네이버 검색 API 모듈
 * - 쇼핑, 블로그, 뉴스, 웹문서, 지식iN 검색 지원
 * - 일일 25,000회 호출 가능
 *
 * API 문서: https://developers.naver.com/docs/serviceapi/search/
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchShopping = searchShopping;
exports.searchBlog = searchBlog;
exports.searchNews = searchNews;
exports.searchWebDoc = searchWebDoc;
exports.searchKin = searchKin;
exports.searchImage = searchImage;
exports.stripHtmlTags = stripHtmlTags;
exports.extractProductNameFromUrl = extractProductNameFromUrl;
exports.getProductInfoFast = getProductInfoFast;
exports.searchMultipleSources = searchMultipleSources;
exports.crawlNaverAutocomplete = crawlNaverAutocomplete;
exports.getSeoKeywordsWithGemini = getSeoKeywordsWithGemini;
exports.getNaverAutocomplete = getNaverAutocomplete;
exports.generateShoppingConnectTitle = generateShoppingConnectTitle;
var configManager_js_1 = require("./configManager.js");
// ==================== API 호출 함수 ====================
/**
 * 네이버 검색 API 기본 호출 함수
 */
function callNaverSearchApi(endpoint, options, config) {
    return __awaiter(this, void 0, void 0, function () {
        var clientId, clientSecret, appConfig, params, url, response, errorText, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    clientId = config === null || config === void 0 ? void 0 : config.clientId;
                    clientSecret = config === null || config === void 0 ? void 0 : config.clientSecret;
                    if (!(!clientId || !clientSecret)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, configManager_js_1.loadConfig)()];
                case 1:
                    appConfig = _a.sent();
                    clientId = appConfig.naverClientId || appConfig.naverDatalabClientId;
                    clientSecret = appConfig.naverClientSecret || appConfig.naverDatalabClientSecret;
                    _a.label = 2;
                case 2:
                    if (!clientId || !clientSecret) {
                        throw new Error('네이버 검색 API 키가 설정되지 않았습니다. 설정에서 Client ID와 Client Secret을 입력해주세요.');
                    }
                    params = new URLSearchParams();
                    params.append('query', options.query);
                    params.append('display', String(options.display || 10));
                    params.append('start', String(options.start || 1));
                    if (options.sort) {
                        params.append('sort', options.sort);
                    }
                    url = "https://openapi.naver.com/v1/search/".concat(endpoint, ".json?").concat(params.toString());
                    console.log("[NaverSearchAPI] ".concat(endpoint, " \uAC80\uC0C9: \"").concat(options.query, "\""));
                    return [4 /*yield*/, fetch(url, {
                            method: 'GET',
                            headers: {
                                'X-Naver-Client-Id': clientId,
                                'X-Naver-Client-Secret': clientSecret,
                            },
                        })];
                case 3:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.text()];
                case 4:
                    errorText = _a.sent();
                    throw new Error("\uB124\uC774\uBC84 \uAC80\uC0C9 API \uC624\uB958 (".concat(response.status, "): ").concat(errorText));
                case 5: return [4 /*yield*/, response.json()];
                case 6:
                    data = _a.sent();
                    console.log("[NaverSearchAPI] ".concat(endpoint, " \uAC80\uC0C9 \uC644\uB8CC: ").concat(data.items.length, "\uAC1C \uACB0\uACFC"));
                    return [2 /*return*/, data];
            }
        });
    });
}
// ==================== 검색 함수들 ====================
/**
 * 쇼핑 검색 - 상품 정보 조회
 */
function searchShopping(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        var baseOptions;
        return __generator(this, function (_a) {
            baseOptions = {
                query: options.query,
                display: options.display,
                start: options.start,
                sort: options.sort === 'asc' || options.sort === 'dsc' ? 'sim' : options.sort,
            };
            return [2 /*return*/, callNaverSearchApi('shop', baseOptions, config)];
        });
    });
}
/**
 * 블로그 검색 - 참고자료 수집용
 */
function searchBlog(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, callNaverSearchApi('blog', options, config)];
        });
    });
}
/**
 * 뉴스 검색 - 최신 이슈 수집용
 */
function searchNews(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, callNaverSearchApi('news', options, config)];
        });
    });
}
/**
 * 웹문서 검색 - 일반 정보 수집용
 */
function searchWebDoc(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, callNaverSearchApi('webkr', options, config)];
        });
    });
}
/**
 * 지식iN 검색 - Q&A 정보 수집용
 */
function searchKin(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, callNaverSearchApi('kin', options, config)];
        });
    });
}
/**
 * ✅ [2026-02-12] 이미지 검색 - 소제목별 관련 이미지 수집용
 * endpoint: /v1/search/image
 */
function searchImage(options, config) {
    return __awaiter(this, void 0, void 0, function () {
        var baseOptions;
        return __generator(this, function (_a) {
            baseOptions = {
                query: options.query,
                display: options.display || 10,
                start: options.start,
                sort: options.sort,
            };
            return [2 /*return*/, callNaverSearchApi('image', baseOptions, config)];
        });
    });
}
// ==================== 유틸리티 함수 ====================
/**
 * HTML 태그 제거 (검색 결과에서 <b> 태그 등 제거)
 */
function stripHtmlTags(text) {
    return text.replace(/<[^>]*>/g, '');
}
/**
 * brand.naver.com URL에서 상품명 추출
 */
function extractProductNameFromUrl(url) {
    // URL 디코딩
    var decoded = decodeURIComponent(url);
    // 패턴: /products/숫자?... 앞의 경로에서 상품명 추출 시도
    // 또는 쿼리 파라미터에서 추출
    // 방법 1: URL 경로에서 추출 시도
    var pathMatch = decoded.match(/\/products\/(\d+)/);
    if (pathMatch) {
        return pathMatch[1]; // 상품 ID 반환
    }
    return null;
}
/**
 * 쇼핑 검색으로 상품 정보 빠르게 가져오기
 * - brand.naver.com URL 크롤링 대체용
 */
function getProductInfoFast(productUrl, config) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded, urlParts, searchQuery, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    decoded = decodeURIComponent(productUrl);
                    urlParts = decoded.split('/');
                    searchQuery = urlParts[urlParts.length - 1].split('?')[0];
                    // 숫자만 있으면 상품 ID이므로 검색 어려움
                    if (/^\d+$/.test(searchQuery)) {
                        return [2 /*return*/, {
                                success: false,
                                error: '상품 ID만으로는 검색이 어렵습니다. 상품명을 직접 입력해주세요.',
                            }];
                    }
                    return [4 /*yield*/, searchShopping({ query: searchQuery, display: 1 }, config)];
                case 1:
                    result = _a.sent();
                    if (result.items.length > 0) {
                        return [2 /*return*/, {
                                success: true,
                                product: result.items[0],
                            }];
                    }
                    return [2 /*return*/, {
                            success: false,
                            error: '검색 결과가 없습니다.',
                        }];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: error_1.message,
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 에러 발생 시 반환할 빈 응답 객체 생성 헬퍼
 */
function createEmptyResponse() {
    return {
        lastBuildDate: new Date().toString(),
        total: 0,
        start: 0,
        display: 0,
        items: []
    };
}
/**
 * 키워드로 다중 소스 검색 (블로그 + 뉴스 + 웹문서)
 * - 참고자료 수집용
 */
function searchMultipleSources(keyword, config) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, blogResult, newsResult, webResult, totalCount;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("[NaverSearchAPI] \uB2E4\uC911 \uC18C\uC2A4 \uAC80\uC0C9 \uC2DC\uC791: \"".concat(keyword, "\""));
                    return [4 /*yield*/, Promise.all([
                            searchBlog({ query: keyword, display: 5 }, config).catch(function () { return createEmptyResponse(); }),
                            searchNews({ query: keyword, display: 5 }, config).catch(function () { return createEmptyResponse(); }),
                            searchWebDoc({ query: keyword, display: 5 }, config).catch(function () { return createEmptyResponse(); }),
                        ])];
                case 1:
                    _a = _b.sent(), blogResult = _a[0], newsResult = _a[1], webResult = _a[2];
                    totalCount = blogResult.items.length +
                        newsResult.items.length +
                        webResult.items.length;
                    console.log("[NaverSearchAPI] \uB2E4\uC911 \uC18C\uC2A4 \uAC80\uC0C9 \uC644\uB8CC: \uCD1D ".concat(totalCount, "\uAC1C \uACB0\uACFC"));
                    return [2 /*return*/, {
                            blogs: blogResult.items,
                            news: newsResult.items,
                            webDocs: webResult.items,
                            totalCount: totalCount,
                        }];
            }
        });
    });
}
/**
 * ✅ [2026-01-25] 네이버 검색창 자동완성 크롤링 (Puppeteer)
 * - 실제 네이버 검색창에서 자동완성 결과 수집
 * - 예: "케어팟 가습기 x50v" → ["단점", "사용법", "내돈내산", "스탠드", ...]
 */
function crawlNaverAutocomplete(keyword) {
    return __awaiter(this, void 0, void 0, function () {
        var puppeteer, chromePaths, browser, _i, chromePaths_1, chromePath, e_1, page, suggestions, keywordLower, extractedKeywords, _a, suggestions_1, suggestion, suggestionLower, remaining, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!keyword || keyword.trim().length < 2)
                        return [2 /*return*/, []];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 17, , 18]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('puppeteer-core')); })];
                case 2:
                    puppeteer = _b.sent();
                    chromePaths = [
                        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                        process.env.CHROME_PATH || '',
                    ].filter(Boolean);
                    browser = null;
                    _i = 0, chromePaths_1 = chromePaths;
                    _b.label = 3;
                case 3:
                    if (!(_i < chromePaths_1.length)) return [3 /*break*/, 8];
                    chromePath = chromePaths_1[_i];
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, puppeteer.default.launch({
                            headless: true,
                            executablePath: chromePath,
                            args: ['--no-sandbox', '--disable-setuid-sandbox'],
                        })];
                case 5:
                    browser = _b.sent();
                    return [3 /*break*/, 8];
                case 6:
                    e_1 = _b.sent();
                    return [3 /*break*/, 7];
                case 7:
                    _i++;
                    return [3 /*break*/, 3];
                case 8:
                    if (!browser) {
                        console.warn('[NaverAutocomplete] 브라우저 실행 실패');
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, browser.newPage()];
                case 9:
                    page = _b.sent();
                    return [4 /*yield*/, page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')];
                case 10:
                    _b.sent();
                    return [4 /*yield*/, page.goto('https://www.naver.com', { waitUntil: 'networkidle2', timeout: 15000 })];
                case 11:
                    _b.sent();
                    return [4 /*yield*/, page.waitForSelector('#query', { timeout: 5000 })];
                case 12:
                    _b.sent();
                    return [4 /*yield*/, page.type('#query', keyword.trim(), { delay: 50 })];
                case 13:
                    _b.sent();
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1000); })];
                case 14:
                    _b.sent();
                    return [4 /*yield*/, page.evaluate(function () {
                            var items = [];
                            var selectors = ['#autocomplete_wrap li', '.ac_list li', '[role="listbox"] li'];
                            for (var _i = 0, selectors_1 = selectors; _i < selectors_1.length; _i++) {
                                var sel = selectors_1[_i];
                                document.querySelectorAll(sel).forEach(function (el) {
                                    var _a;
                                    var text = (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim();
                                    if (text && !items.includes(text))
                                        items.push(text);
                                });
                            }
                            return items;
                        })];
                case 15:
                    suggestions = _b.sent();
                    return [4 /*yield*/, browser.close()];
                case 16:
                    _b.sent();
                    keywordLower = keyword.trim().toLowerCase();
                    extractedKeywords = [];
                    for (_a = 0, suggestions_1 = suggestions; _a < suggestions_1.length; _a++) {
                        suggestion = suggestions_1[_a];
                        suggestionLower = suggestion.toLowerCase();
                        if (suggestionLower.startsWith(keywordLower) || suggestionLower.includes(keywordLower)) {
                            remaining = suggestion.replace(new RegExp(keyword.trim(), 'gi'), '').trim();
                            if (remaining && remaining.length >= 2 && !extractedKeywords.includes(remaining)) {
                                extractedKeywords.push(remaining);
                            }
                        }
                    }
                    console.log("[NaverAutocomplete] \"".concat(keyword, "\" \u2192 [").concat(extractedKeywords.slice(0, 5).join(', '), "]"));
                    return [2 /*return*/, extractedKeywords.slice(0, 5)];
                case 17:
                    error_2 = _b.sent();
                    console.warn("[NaverAutocomplete] \uD06C\uB864\uB9C1 \uC2E4\uD328: ".concat(error_2.message));
                    return [2 /*return*/, []];
                case 18: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ [2026-01-25] Gemini AI로 SEO 키워드 생성
 * - 제품명을 입력하면 관련 검색 키워드 추천
 * - 네이버 자동완성보다 정확하고 안정적
 */
function getSeoKeywordsWithGemini(productName) {
    return __awaiter(this, void 0, void 0, function () {
        var GoogleGenerativeAI, apiKey, genAI, model, prompt_1, result, response, text, jsonMatch, keywords, validKeywords, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!productName || productName.trim().length < 3)
                        return [2 /*return*/, []];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('@google/generative-ai')); })];
                case 2:
                    GoogleGenerativeAI = (_a.sent()).GoogleGenerativeAI;
                    apiKey = process.env.GEMINI_API_KEY;
                    if (!apiKey) {
                        console.warn('[SEO Gemini] API 키가 없습니다.');
                        return [2 /*return*/, []];
                    }
                    genAI = new GoogleGenerativeAI(apiKey);
                    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                    prompt_1 = "\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uC1FC\uD551 SEO \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.\n\n\uB2E4\uC74C \uC81C\uD488\uC5D0 \uB300\uD574 \uC0AC\uC6A9\uC790\uB4E4\uC774 \uB124\uC774\uBC84\uC5D0\uC11C \uC2E4\uC81C\uB85C \uAC80\uC0C9\uD560 \uAC83 \uAC19\uC740 \uC138\uBD80 \uD0A4\uC6CC\uB4DC 2-3\uAC1C\uB97C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.\n\n\uC81C\uD488\uBA85: ".concat(productName.trim(), "\n\n\uADDC\uCE59:\n1. \uC81C\uD488\uBA85\uC5D0 \uC774\uBBF8 \uD3EC\uD568\uB41C \uB2E8\uC5B4\uB294 \uC81C\uC678\n2. \uAD6C\uB9E4 \uC758\uB3C4\uAC00 \uC788\uB294 \uAC80\uC0C9 \uD0A4\uC6CC\uB4DC (\uC608: \uD6C4\uAE30, \uBE44\uAD50, \uC131\uB2A5, \uC18C\uC74C, \uC804\uAE30\uC138 \uB4F1)\n3. \uAC01 \uD0A4\uC6CC\uB4DC\uB294 1-2\uB2E8\uC5B4\uB85C \uC9E7\uAC8C\n4. JSON \uBC30\uC5F4 \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5 (\uC608: [\"\uD6C4\uAE30\", \"\uC804\uAE30\uC138\", \"\uC18C\uC74C\"])\n\n\uC751\uB2F5:");
                    return [4 /*yield*/, model.generateContent(prompt_1)];
                case 3:
                    result = _a.sent();
                    return [4 /*yield*/, result.response];
                case 4:
                    response = _a.sent();
                    text = response.text().trim();
                    jsonMatch = text.match(/\[.*\]/s);
                    if (jsonMatch) {
                        keywords = JSON.parse(jsonMatch[0]);
                        validKeywords = keywords
                            .filter(function (k) { return typeof k === 'string' && k.trim().length > 0; })
                            .map(function (k) { return k.trim(); })
                            .slice(0, 3);
                        console.log("[SEO Gemini] \"".concat(productName, "\" \u2192 [").concat(validKeywords.join(', '), "]"));
                        return [2 /*return*/, validKeywords];
                    }
                    return [2 /*return*/, []];
                case 5:
                    error_3 = _a.sent();
                    console.warn("[SEO Gemini] \uD0A4\uC6CC\uB4DC \uC0DD\uC131 \uC2E4\uD328: ".concat(error_3.message));
                    return [2 /*return*/, []];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ [2026-01-24] 네이버 자동완성 API (비공식) - 폴백용
 */
function getNaverAutocomplete(keyword) {
    return __awaiter(this, void 0, void 0, function () {
        var encodedKeyword, url, response, data, suggestions, items, _i, items_1, item, suggestion, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!keyword || keyword.trim().length < 2)
                        return [2 /*return*/, []];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    encodedKeyword = encodeURIComponent(keyword.trim());
                    url = "https://ac.search.naver.com/nx/ac?q=".concat(encodedKeyword, "&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8");
                    return [4 /*yield*/, fetch(url, {
                            method: 'GET',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Accept': 'application/json',
                                'Accept-Language': 'ko-KR,ko;q=0.9',
                                'Referer': 'https://www.naver.com/',
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    suggestions = [];
                    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
                        items = data.items[0];
                        if (Array.isArray(items)) {
                            for (_i = 0, items_1 = items; _i < items_1.length; _i++) {
                                item = items_1[_i];
                                if (Array.isArray(item) && item.length > 0) {
                                    suggestion = item[0];
                                    if (typeof suggestion === 'string' && suggestion.trim()) {
                                        suggestions.push(suggestion.trim());
                                    }
                                }
                            }
                        }
                    }
                    return [2 /*return*/, suggestions.slice(0, 10)];
                case 4:
                    error_4 = _a.sent();
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ [2026-02-02] 100점 SEO 제목 생성 로직
 *
 * 핵심 전략:
 * 1. 제품명에서 핵심 키워드만 추출 (브랜드 + 제품라인)
 * 2. 네이버 자동완성 세부키워드 활용 (실제 검색어)
 * 3. 차별화 후킹 멘트 조합 (클릭 유도)
 * 4. 자연스러운 문장 구성
 *
 * 예: "삼성 비스포크 AI콤보 세탁기건조기 일체형 1등급 화이트 WD80F25CHW"
 * → "삼성 비스포크 AI콤보 내돈내산 1년 사용 솔직후기 전기료 공개"
 */
function generateShoppingConnectTitle(productName_1) {
    return __awaiter(this, arguments, void 0, function (productName, maxKeywords) {
        var cleanName, coreProductName, autocompleteKeywords, autocompleteResults, coreWords_2, _i, autocompleteResults_1, suggestion, remaining, _a, coreWords_1, word, keywords, error_5, geminiKeywords, _b, geminiKeywords_1, gk, error_6, universalSeoKeywords, shuffled, _c, shuffled_1, uk, minRequired, selectedKeywords, titleParts, finalTitle, keywordsInTitle, missing, _d, missing_1, mk;
        if (maxKeywords === void 0) { maxKeywords = 3; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!productName || productName.trim().length < 3) {
                        return [2 /*return*/, productName || ''];
                    }
                    cleanName = productName.trim();
                    coreProductName = extractCoreProductName(cleanName);
                    console.log("[SEO] \uD575\uC2EC \uC81C\uD488\uBA85 \uCD94\uCD9C: \"".concat(cleanName, "\" \u2192 \"").concat(coreProductName, "\""));
                    autocompleteKeywords = [];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, getNaverAutocomplete(coreProductName)];
                case 2:
                    autocompleteResults = _e.sent();
                    coreWords_2 = coreProductName.toLowerCase().split(/\s+/);
                    for (_i = 0, autocompleteResults_1 = autocompleteResults; _i < autocompleteResults_1.length; _i++) {
                        suggestion = autocompleteResults_1[_i];
                        remaining = suggestion;
                        for (_a = 0, coreWords_1 = coreWords_2; _a < coreWords_1.length; _a++) {
                            word = coreWords_1[_a];
                            if (word.length >= 2) {
                                remaining = remaining.replace(new RegExp(word, 'gi'), '').trim();
                            }
                        }
                        keywords = remaining.split(/\s+/).filter(function (k) {
                            return k.length >= 2 &&
                                !coreWords_2.includes(k.toLowerCase()) &&
                                !autocompleteKeywords.includes(k);
                        });
                        autocompleteKeywords.push.apply(autocompleteKeywords, keywords);
                    }
                    autocompleteKeywords = __spreadArray([], new Set(autocompleteKeywords), true).slice(0, 8);
                    console.log("[SEO] \uC790\uB3D9\uC644\uC131 \uD0A4\uC6CC\uB4DC (1\uCC28): [".concat(autocompleteKeywords.join(', '), "] (").concat(autocompleteKeywords.length, "\uAC1C)"));
                    return [3 /*break*/, 4];
                case 3:
                    error_5 = _e.sent();
                    console.warn("[SEO] \uC790\uB3D9\uC644\uC131 \uC2E4\uD328: ".concat(error_5.message));
                    return [3 /*break*/, 4];
                case 4:
                    if (!(autocompleteKeywords.length < 3)) return [3 /*break*/, 8];
                    console.log("[SEO] \uC790\uB3D9\uC644\uC131 \uD0A4\uC6CC\uB4DC \uBD80\uC871 (".concat(autocompleteKeywords.length, "\uAC1C) \u2192 Gemini AI \uD3F4\uBC31 \uD638\uCD9C"));
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, getSeoKeywordsWithGemini(coreProductName)];
                case 6:
                    geminiKeywords = _e.sent();
                    // 중복 제거 후 추가
                    for (_b = 0, geminiKeywords_1 = geminiKeywords; _b < geminiKeywords_1.length; _b++) {
                        gk = geminiKeywords_1[_b];
                        if (!autocompleteKeywords.includes(gk) && !coreProductName.toLowerCase().includes(gk.toLowerCase())) {
                            autocompleteKeywords.push(gk);
                        }
                    }
                    console.log("[SEO] Gemini \uBCF4\uAC15 \uD6C4 \uD0A4\uC6CC\uB4DC: [".concat(autocompleteKeywords.join(', '), "] (").concat(autocompleteKeywords.length, "\uAC1C)"));
                    return [3 /*break*/, 8];
                case 7:
                    error_6 = _e.sent();
                    console.warn("[SEO] Gemini \uD3F4\uBC31 \uC2E4\uD328: ".concat(error_6.message));
                    return [3 /*break*/, 8];
                case 8:
                    // ✅ 4. 그래도 부족하면 범용 SEO 키워드 풀에서 보충 (3차)
                    if (autocompleteKeywords.length < 3) {
                        console.log("[SEO] \uD0A4\uC6CC\uB4DC \uC5EC\uC804\uD788 \uBD80\uC871 (".concat(autocompleteKeywords.length, "\uAC1C) \u2192 \uBC94\uC6A9 SEO \uD0A4\uC6CC\uB4DC \uBCF4\uCDA9"));
                        universalSeoKeywords = [
                            '후기', '추천', '비교', '장단점', '솔직후기', '실사용',
                            '가성비', '내돈내산', '총정리', '꿀팁', '사용법', '리뷰'
                        ];
                        shuffled = universalSeoKeywords.sort(function () { return Math.random() - 0.5; });
                        for (_c = 0, shuffled_1 = shuffled; _c < shuffled_1.length; _c++) {
                            uk = shuffled_1[_c];
                            if (autocompleteKeywords.length >= 5)
                                break;
                            if (!autocompleteKeywords.includes(uk) && !coreProductName.toLowerCase().includes(uk.toLowerCase())) {
                                autocompleteKeywords.push(uk);
                            }
                        }
                        console.log("[SEO] \uBC94\uC6A9 \uBCF4\uCDA9 \uD6C4 \uD0A4\uC6CC\uB4DC: [".concat(autocompleteKeywords.join(', '), "] (").concat(autocompleteKeywords.length, "\uAC1C)"));
                    }
                    minRequired = Math.max(maxKeywords, 3);
                    selectedKeywords = autocompleteKeywords.slice(0, Math.min(minRequired + 1, 5));
                    titleParts = __spreadArray([coreProductName], selectedKeywords, true);
                    finalTitle = titleParts.join(' ').trim();
                    while (finalTitle.length > 55 && titleParts.length > 4) {
                        titleParts.pop();
                        finalTitle = titleParts.join(' ').trim();
                    }
                    keywordsInTitle = selectedKeywords.filter(function (k) { return finalTitle.includes(k); });
                    if (keywordsInTitle.length < 3 && autocompleteKeywords.length >= 3) {
                        missing = autocompleteKeywords.filter(function (k) { return !finalTitle.includes(k); });
                        for (_d = 0, missing_1 = missing; _d < missing_1.length; _d++) {
                            mk = missing_1[_d];
                            if (keywordsInTitle.length >= 3)
                                break;
                            titleParts.push(mk);
                            keywordsInTitle.push(mk);
                        }
                        finalTitle = titleParts.join(' ').trim();
                        // 다시 길이 체크
                        while (finalTitle.length > 55 && titleParts.length > 4) {
                            titleParts.pop();
                            finalTitle = titleParts.join(' ').trim();
                        }
                    }
                    console.log("[SEO Title 100\uC810] \"".concat(cleanName, "\" \u2192 \"").concat(finalTitle, "\" (\uD0A4\uC6CC\uB4DC ").concat(keywordsInTitle.length, "\uAC1C \uD3EC\uD568)"));
                    return [2 /*return*/, finalTitle];
            }
        });
    });
}
/**
 * ✅ 핵심 제품명 추출 (모델번호, 색상, 등급 등 제거)
 *
 * 예: "LIVE 삼성 갤럭시북5 프로360 NT960QHA-K71AR AI 노트북 대학생 사무용 2IN1 삼성"
 * → "삼성 갤럭시북5 프로360"
 */
function extractCoreProductName(fullName) {
    var core = fullName;
    // 0. 스트리밍/라이브 접두사 제거
    core = core.replace(/^(LIVE|라이브|생방송)\s*/gi, '').trim();
    // ✅ [2026-02-02 FIX] 대괄호 브랜드 접두사 제거 [BRAUN], [삼성] 등
    core = core.replace(/^\[[^\]]+\]\s*/g, '').trim();
    // 1. 모델번호 패턴 제거 (더 광범위하게)
    // NT960QHA-K71AR, WD80F25CHW, SM-G998N, 9665cc 등
    core = core.replace(/[A-Z]{1,4}[\d]{2,}[A-Z\d\-]*/gi, '').trim();
    core = core.replace(/[\d]{3,}[A-Z]{1,4}[\d\-]*/gi, '').trim();
    core = core.replace(/[A-Z]{2,}-[A-Z\d]+/gi, '').trim(); // SM-G998N 형식
    // ✅ [2026-02-02 FIX] 숫자+영문소문자 모델번호 (9665cc)
    core = core.replace(/\d{3,}[a-zA-Z]{1,3}\b/g, '').trim();
    // 2. 색상 키워드 제거
    // ✅ [2026-02-02 FIX] \b가 한글에서 작동하지 않으므로 색상도 genericWords에 통합
    var colorKeywords = [
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지', '브라운',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        'white', 'black', 'gray', 'silver', 'gold', 'navy', 'beige', 'brown',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
    ];
    // 영문 색상은 \b가 작동하므로 먼저 처리
    for (var _i = 0, _a = colorKeywords.filter(function (c) { return /^[a-zA-Z]+$/.test(c); }); _i < _a.length; _i++) {
        var color = _a[_i];
        core = core.replace(new RegExp("\\b".concat(color, "\\b"), 'gi'), '').trim();
    }
    // 3. 등급/용량/사이즈 키워드 제거
    var removePatterns = [
        /\d+등급/g, // 1등급, 2등급
        /\d+[LlKk][Gg]?/g, // 10L, 20kg
        /\d+[Ww]/g, // 100W
        /\d+인치/g, // 65인치
        /\d+[Mm][Mm]/g, // 100mm
        /\(\d+[^\)]*\)/g, // (123ABC)
        /\[\d+[^\]]*\]/g, // [123ABC]
        /\d+[Gg][Bb]/gi, // 256GB, 512gb
        /\d+[Tt][Bb]/gi, // 1TB, 2tb
    ];
    for (var _b = 0, removePatterns_1 = removePatterns; _b < removePatterns_1.length; _b++) {
        var pattern = removePatterns_1[_b];
        core = core.replace(pattern, '').trim();
    }
    // 4. 일반적 수식어/용도 제거 (공백 기반 단어 필터링 - 한글에서 \b 미작동)
    // ✅ [2026-02-02 FIX] 한글 색상도 여기서 함께 필터링
    var genericWords = new Set([
        '일체형', '분리형', '올인원', '프리미엄', '에디션', '스페셜', '리미티드',
        '신형', '신제품', '최신형', '2024', '2025', '2026',
        '대학생', '사무용', '게이밍', '업무용', '학생용', '가정용', '기업용',
        '2IN1', '2in1', 'AI', 'PRO', 'PLUS', 'ULTRA', 'MAX', 'LITE',
        '울트라', '플러스', '프로', '씬', 'Plus',
        '노트북', '데스크탑', '태블릿', '세탁기', '건조기', '세탁기건조기',
        // ✅ [2026-02-02 FIX] 한글 색상 추가 (공백 기반 필터링)
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
        // ⚠️ '브라운' 제외: BRAUN(면도기 브랜드)과 혼동 방지
    ]);
    // ✅ [2026-02-02 FIX] 첫 번째 단어는 브랜드명일 가능성이 높으므로 필터링에서 제외
    var wordsToFilter = core.split(/\s+/);
    var firstWord = wordsToFilter[0] || '';
    var remainingWords = wordsToFilter.slice(1);
    var filteredRemaining = remainingWords.filter(function (word) {
        return !genericWords.has(word) && !genericWords.has(word.toUpperCase()) && !genericWords.has(word.toLowerCase());
    });
    core = __spreadArray([firstWord], filteredRemaining, true).join(' ').trim();
    // 5. 중복 브랜드명 제거 (맨 앞과 맨 뒤에 같은 브랜드가 있으면 뒤쪽 제거)
    var words = core.split(/\s+/);
    if (words.length >= 2) {
        var firstWord_1 = words[0].toLowerCase();
        var lastWord = words[words.length - 1].toLowerCase();
        if (firstWord_1 === lastWord) {
            words.pop(); // 마지막 중복 제거
            core = words.join(' ');
        }
    }
    // 6. 연속 공백 정리
    core = core.replace(/\s+/g, ' ').trim();
    // 7. 핵심이 너무 짧으면 원본에서 첫 3-4단어 사용
    if (core.length < 5 || core.split(/\s+/).length < 2) {
        var originalWords = fullName
            .replace(/^(LIVE|라이브|생방송)\s*/gi, '')
            .replace(/^\[[^\]]+\]\s*/g, '') // 대괄호 브랜드 제거
            .split(/\s+/)
            .filter(function (w) { return !w.match(/[A-Z]{2,}[\d]{2,}/i); }) // 모델번호 제외
            .slice(0, 4);
        core = originalWords.join(' ');
    }
    // ✅ [2026-03-04 FIX] 최대 8단어로 확대 (크롤링 제품명 전체 보존)
    var finalWords = core.split(/\s+/).slice(0, 8);
    core = finalWords.join(' ');
    return core;
}
