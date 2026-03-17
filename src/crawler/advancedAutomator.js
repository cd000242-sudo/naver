"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedAutomator = void 0;
var ghost_cursor_1 = require("ghost-cursor");
/**
 * High-Fidelity Interaction Engine (AdvancedAutomator)
 * Playwright Stealth 환경 위에 인간의 생체 역학적 움직임과 비선형적 딜레이를 추가하여
 * 100%에 가까운 봇 탐지 우회를 돕는 코어 클래스.
 */
var AdvancedAutomator = /** @class */ (function () {
    function AdvancedAutomator() {
        this.browserContent = null;
        this.page = null;
        this.cursor = null;
    }
    /**
     * 확률론적 가우시안 지연 시간 생성
     * 무조건 일정한 딜레이(예: random(100, 200))가 아닌,
     * 인간의 행동 패턴 곡선(종 모양의 정규 분포)을 모사한 값을 반환합니다.
     *
     * @param mean 평균 지연 시간 (ms)
     * @param stdDev 표준 편차
     * @returns 계산된 지연 시간 (ms)
     */
    AdvancedAutomator.prototype.generateGaussianDelay = function (mean, stdDev) {
        var u1 = 0, u2 = 0;
        while (u1 === 0)
            u1 = Math.random();
        while (u2 === 0)
            u2 = Math.random();
        var z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        var delay = Math.round(mean + z * stdDev);
        return Math.max(10, delay); // 최소 10ms 보장
    };
    /**
     * 인간과 유사한 지연 시간으로 대기합니다.
     * 기본은 평균 800ms, 표준편차 300ms 입니다.
     */
    AdvancedAutomator.prototype.randomWait = function () {
        return __awaiter(this, arguments, void 0, function (mean, stdDev) {
            var delay;
            if (mean === void 0) { mean = 800; }
            if (stdDev === void 0) { stdDev = 300; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        delay = this.generateGaussianDelay(mean, stdDev);
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 해당 셀렉터가 화면에 실제로 보이는지(Visible) 계산하여 스크롤하는 유기적 접근 로직
     */
    AdvancedAutomator.prototype.organicScrollTo = function (selector) {
        return __awaiter(this, void 0, void 0, function () {
            var element, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.page)
                            throw new Error('페이지가 초기화되지 않았습니다.');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.page.$(selector)];
                    case 2:
                        element = _a.sent();
                        if (!element)
                            return [2 /*return*/, false];
                        // 엘리먼트가 화면에 보이도록 부드럽게 스크롤
                        return [4 /*yield*/, element.scrollIntoViewIfNeeded()];
                    case 3:
                        // 엘리먼트가 화면에 보이도록 부드럽게 스크롤
                        _a.sent();
                        // 스크롤 후 사람이 화면을 인지하는 시간 부여
                        return [4 /*yield*/, this.randomWait(1200, 400)];
                    case 4:
                        // 스크롤 후 사람이 화면을 인지하는 시간 부여
                        _a.sent();
                        return [2 /*return*/, true];
                    case 5:
                        e_1 = _a.sent();
                        console.error("[AdvancedAutomator] \uC2A4\uD06C\uB864 \uC2E4\uD328: ".concat(selector), e_1);
                        return [2 /*return*/, false];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 마우스를 비선형적 궤적으로 이동시킨 후, 클릭 전후 미세한 딜레이를 동반한 유기적 클릭
     */
    AdvancedAutomator.prototype.organicClick = function (selector) {
        return __awaiter(this, void 0, void 0, function () {
            var isVisible, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.page || !this.cursor) {
                            throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.organicScrollTo(selector)];
                    case 2:
                        isVisible = _a.sent();
                        if (!isVisible) {
                            console.warn("[AdvancedAutomator] \uD074\uB9AD \uB300\uC0C1 \uB178\uCD9C \uC548\uB428: ".concat(selector));
                            return [2 /*return*/, false];
                        }
                        // 커서를 베지에 곡선 기반으로 유기적 이동
                        return [4 /*yield*/, this.cursor.click(selector)];
                    case 3:
                        // 커서를 베지에 곡선 기반으로 유기적 이동
                        _a.sent();
                        // 클릭 직후 잔여 동작(여운) 대기
                        return [4 /*yield*/, this.randomWait(500, 200)];
                    case 4:
                        // 클릭 직후 잔여 동작(여운) 대기
                        _a.sent();
                        return [2 /*return*/, true];
                    case 5:
                        e_2 = _a.sent();
                        console.error("[AdvancedAutomator] \uD074\uB9AD \uC2E4\uD328: ".concat(selector), e_2);
                        return [2 /*return*/, false];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 키보드 타이핑 시 한 글자 단위마다 물리적 키보드의 가우시안 지연을 부여해 입력
     */
    AdvancedAutomator.prototype.organicType = function (selector, text) {
        return __awaiter(this, void 0, void 0, function () {
            var isVisible, _i, text_1, char, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.page || !this.cursor) {
                            throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 11, , 12]);
                        return [4 /*yield*/, this.organicScrollTo(selector)];
                    case 2:
                        isVisible = _a.sent();
                        if (!isVisible)
                            return [2 /*return*/, false];
                        // 입력란 클릭
                        return [4 /*yield*/, this.cursor.click(selector)];
                    case 3:
                        // 입력란 클릭
                        _a.sent();
                        return [4 /*yield*/, this.randomWait(300, 100)];
                    case 4:
                        _a.sent();
                        _i = 0, text_1 = text;
                        _a.label = 5;
                    case 5:
                        if (!(_i < text_1.length)) return [3 /*break*/, 9];
                        char = text_1[_i];
                        return [4 /*yield*/, this.page.keyboard.type(char)];
                    case 6:
                        _a.sent();
                        // 타이핑 간 가우시안 딜레이 (평균 150ms, 표준편차 40ms)
                        return [4 /*yield*/, this.randomWait(150, 40)];
                    case 7:
                        // 타이핑 간 가우시안 딜레이 (평균 150ms, 표준편차 40ms)
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 5];
                    case 9: 
                    // 입력 완료 후 확인 시간
                    return [4 /*yield*/, this.randomWait(700, 250)];
                    case 10:
                        // 입력 완료 후 확인 시간
                        _a.sent();
                        return [2 /*return*/, true];
                    case 11:
                        e_3 = _a.sent();
                        console.error("[AdvancedAutomator] \uC785\uB825 \uC2E4\uD328: ".concat(selector), e_3);
                        return [2 /*return*/, false];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 페이지와 브라우저 객체를 자동화 엔진 커서와 연결합니다.
     * crawlerBrowser.ts에서 생성한 context와 page를 주입받아 사용합니다.
     */
    AdvancedAutomator.prototype.attach = function (context, page) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.browserContent = context;
                this.page = page;
                this.cursor = (0, ghost_cursor_1.createCursor)(page);
                console.log('[AdvancedAutomator] Ghost-Cursor Attach 완료.');
                return [2 /*return*/];
            });
        });
    };
    /**
     * 해당 인스턴스의 페이지를 반환합니다.
     */
    AdvancedAutomator.prototype.getPage = function () {
        return this.page;
    };
    /**
     * 페이지 내에서 목적 없이 무작위로 마우스를 움직이고 화면을 약간 위아래로 스크롤합니다 (워밍업 등에 사용)
     */
    AdvancedAutomator.prototype.organicWander = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, innerWidth_1, innerHeight_1, randomX, randomY, scrollAmount, e_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.page || !this.cursor) {
                            throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.page.evaluate(function () {
                                return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
                            })];
                    case 2:
                        _a = _b.sent(), innerWidth_1 = _a.innerWidth, innerHeight_1 = _a.innerHeight;
                        randomX = Math.floor(Math.random() * (innerWidth_1 * 0.8)) + (innerWidth_1 * 0.1);
                        randomY = Math.floor(Math.random() * (innerHeight_1 * 0.8)) + (innerHeight_1 * 0.1);
                        return [4 /*yield*/, this.cursor.moveTo({ x: randomX, y: randomY })];
                    case 3:
                        _b.sent();
                        return [4 /*yield*/, this.randomWait(1000, 400)];
                    case 4:
                        _b.sent();
                        scrollAmount = Math.floor(Math.random() * 400) - 200;
                        return [4 /*yield*/, this.page.mouse.wheel(0, scrollAmount)];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, this.randomWait(800, 300)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        e_4 = _b.sent();
                        console.warn('[AdvancedAutomator] 유기적 배회(organicWander) 실패:', e_4.message);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    return AdvancedAutomator;
}());
exports.AdvancedAutomator = AdvancedAutomator;
