"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChromiumExecutablePath = getChromiumExecutablePath;
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var os_1 = __importDefault(require("os"));
/**
 * ✅ Puppeteer Chromium 경로 찾기 (배포 환경 지원 - 시스템 Chrome/Edge 우선 사용)
 * 여러 파일에 흩어져 있던 로직을 통합하여 관리합니다.
 */
function getChromiumExecutablePath() {
    return __awaiter(this, void 0, void 0, function () {
        var systemChromePaths, _i, systemChromePaths_1, chromePath, puppeteerCachePaths, _a, puppeteerCachePaths_1, cachePath, versions, _b, versions_1, version, chromePath, chromePath2, puppeteer, defaultPath, e_1;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    systemChromePaths = [
                        // Windows 기본 설치 경로들
                        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                        path_1.default.join(os_1.default.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                        // Edge도 Chromium 기반이므로 사용 가능
                        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                    ];
                    // 시스템 Chrome 먼저 확인 (가장 안정적)
                    for (_i = 0, systemChromePaths_1 = systemChromePaths; _i < systemChromePaths_1.length; _i++) {
                        chromePath = systemChromePaths_1[_i];
                        if (fs_1.default.existsSync(chromePath)) {
                            console.log("[BrowserUtils] \u2705 \uC2DC\uC2A4\uD15C \uBE0C\uB77C\uC6B0\uC800 \uBC1C\uACAC: ".concat(chromePath));
                            return [2 /*return*/, chromePath];
                        }
                    }
                    puppeteerCachePaths = [
                        path_1.default.join(os_1.default.homedir(), '.cache', 'puppeteer', 'chrome'),
                        path_1.default.join(os_1.default.homedir(), 'AppData', 'Local', 'puppeteer', 'chrome'),
                    ];
                    for (_a = 0, puppeteerCachePaths_1 = puppeteerCachePaths; _a < puppeteerCachePaths_1.length; _a++) {
                        cachePath = puppeteerCachePaths_1[_a];
                        if (fs_1.default.existsSync(cachePath)) {
                            try {
                                versions = fs_1.default.readdirSync(cachePath);
                                for (_b = 0, versions_1 = versions; _b < versions_1.length; _b++) {
                                    version = versions_1[_b];
                                    chromePath = path_1.default.join(cachePath, version, 'chrome-win64', 'chrome.exe');
                                    if (fs_1.default.existsSync(chromePath)) {
                                        console.log("[BrowserUtils] \u2705 Puppeteer \uCE90\uC2DC \uBE0C\uB77C\uC6B0\uC800 \uBC1C\uACAC: ".concat(chromePath));
                                        return [2 /*return*/, chromePath];
                                    }
                                    chromePath2 = path_1.default.join(cachePath, version, 'chrome-win', 'chrome.exe');
                                    if (fs_1.default.existsSync(chromePath2)) {
                                        console.log("[BrowserUtils] \u2705 Puppeteer \uCE90\uC2DC \uBE0C\uB77C\uC6B0\uC800 \uBC1C\uACAC: ".concat(chromePath2));
                                        return [2 /*return*/, chromePath2];
                                    }
                                }
                            }
                            catch (e) {
                                // 무시
                            }
                        }
                    }
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('puppeteer')); })];
                case 2:
                    puppeteer = _e.sent();
                    defaultPath = (_d = (_c = puppeteer).executablePath) === null || _d === void 0 ? void 0 : _d.call(_c);
                    if (defaultPath && fs_1.default.existsSync(defaultPath)) {
                        console.log("[BrowserUtils] \u2705 Puppeteer \uAE30\uBCF8 \uACBD\uB85C: ".concat(defaultPath));
                        return [2 /*return*/, defaultPath];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _e.sent();
                    return [3 /*break*/, 4];
                case 4:
                    console.log("[BrowserUtils] \u26A0\uFE0F \uBE0C\uB77C\uC6B0\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC74C. Puppeteer \uAE30\uBCF8\uAC12\uC5D0 \uC758\uC874...");
                    return [2 /*return*/, undefined];
            }
        });
    });
}
