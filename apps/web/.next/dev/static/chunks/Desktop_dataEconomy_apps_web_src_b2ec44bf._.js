(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Desktop/dataEconomy/apps/web/src/hooks/useFreighter.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useFreighter",
    ()=>useFreighter
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
function useFreighter() {
    _s();
    const [state, setState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        isInstalled: false,
        isConnected: false,
        publicKey: null,
        error: null
    });
    const connect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useFreighter.useCallback[connect]": async ()=>{
            try {
                const mod = await __turbopack_context__.A("[project]/Desktop/dataEconomy/apps/web/node_modules/@stellar/freighter-api/build/index.min.js [app-client] (ecmascript, async loader)");
                const freighter = mod.freighterApi || mod;
                const { isConnected } = await freighter.isConnected();
                if (!isConnected) {
                    setState({
                        "useFreighter.useCallback[connect]": (s)=>({
                                ...s,
                                isInstalled: false,
                                error: "Freighter yüklü değil. freighter.app adresinden indir."
                            })
                    }["useFreighter.useCallback[connect]"]);
                    return null;
                }
                // Erişim izni iste
                const { isAllowed } = await freighter.isAllowed();
                if (!isAllowed) {
                    await freighter.requestAccess();
                }
                const { address } = await freighter.getAddress();
                if (!address) {
                    setState({
                        "useFreighter.useCallback[connect]": (s)=>({
                                ...s,
                                isInstalled: true,
                                error: "Cüzdan adresi alınamadı"
                            })
                    }["useFreighter.useCallback[connect]"]);
                    return null;
                }
                setState({
                    isInstalled: true,
                    isConnected: true,
                    publicKey: address,
                    error: null
                });
                return address;
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Cüzdan bağlanamadı";
                setState({
                    "useFreighter.useCallback[connect]": (s)=>({
                            ...s,
                            error: msg
                        })
                }["useFreighter.useCallback[connect]"]);
                return null;
            }
        }
    }["useFreighter.useCallback[connect]"], []);
    const signChallenge = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useFreighter.useCallback[signChallenge]": async (challenge)=>{
            try {
                const mod = await __turbopack_context__.A("[project]/Desktop/dataEconomy/apps/web/node_modules/@stellar/freighter-api/build/index.min.js [app-client] (ecmascript, async loader)");
                const freighter = mod.freighterApi || mod;
                // signMessage desteğini kontrol et
                if (typeof freighter.signMessage === "function") {
                    try {
                        const result = await freighter.signMessage(challenge, {
                            networkPassphrase: "Test SDF Network ; September 2015"
                        });
                        if (result?.signedMessage) return result.signedMessage;
                    } catch (signErr) {
                        console.warn("[freighter] signMessage failed, using fallback:", signErr);
                    }
                }
                // Fallback: signMessage yoksa veya başarısızsa,
                // challenge'ın base64 hash'ini imza olarak kullan (testnet MVP)
                const encoder = new TextEncoder();
                const data = encoder.encode(challenge);
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const fallbackSig = btoa(String.fromCharCode(...hashArray));
                return fallbackSig;
            } catch (err) {
                const msg = err instanceof Error ? err.message : "İmzalama başarısız";
                setState({
                    "useFreighter.useCallback[signChallenge]": (s)=>({
                            ...s,
                            error: msg
                        })
                }["useFreighter.useCallback[signChallenge]"]);
                return null;
            }
        }
    }["useFreighter.useCallback[signChallenge]"], []);
    return {
        ...state,
        connect,
        signChallenge
    };
}
_s(useFreighter, "0RlY9wd6sZ5eWV/s3VLIKS/Qxnk=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
;
const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500",
    outline: "border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-500",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500",
    destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
};
const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
};
const Button = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"])(_c = ({ variant = "primary", size = "md", isLoading = false, disabled, children, className = "", ...props }, ref)=>{
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        ref: ref,
        disabled: disabled || isLoading,
        className: [
            "inline-flex items-center justify-center rounded-md font-medium",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            "transition-colors duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            variantClasses[variant],
            sizeClasses[size],
            className
        ].join(" "),
        ...props,
        children: [
            isLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                className: "mr-2 h-4 w-4 animate-spin",
                xmlns: "http://www.w3.org/2000/svg",
                fill: "none",
                viewBox: "0 0 24 24",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        className: "opacity-25",
                        cx: "12",
                        cy: "12",
                        r: "10",
                        stroke: "currentColor",
                        strokeWidth: "4"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx",
                        lineNumber: 63,
                        columnNumber: 13
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        className: "opacity-75",
                        fill: "currentColor",
                        d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx",
                        lineNumber: 71,
                        columnNumber: 13
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx",
                lineNumber: 57,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0)),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx",
        lineNumber: 42,
        columnNumber: 7
    }, ("TURBOPACK compile-time value", void 0));
});
_c1 = Button;
Button.displayName = "Button";
const __TURBOPACK__default__export__ = Button;
var _c, _c1;
__turbopack_context__.k.register(_c, "Button$forwardRef");
__turbopack_context__.k.register(_c1, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LoginPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next-auth/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$hooks$2f$useFreighter$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/src/hooks/useFreighter.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$Button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
const stepLabel = {
    idle: "Freighter ile Bağlan",
    connecting: "Cüzdan açılıyor...",
    signing: "İmzalama bekleniyor...",
    verifying: "Doğrulanıyor...",
    error: "Tekrar Dene"
};
function LoginPage() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const freighter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$hooks$2f$useFreighter$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFreighter"])();
    const [step, setStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("idle");
    const [errorMsg, setErrorMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const isLoading = step === "connecting" || step === "signing" || step === "verifying";
    const handleConnect = async ()=>{
        setErrorMsg(null);
        setStep("connecting");
        // 1. Freighter'a bağlan, public key al
        const publicKey = await freighter.connect();
        if (!publicKey) {
            setErrorMsg(freighter.error || "Cüzdan bağlanamadı");
            setStep("error");
            return;
        }
        setStep("signing");
        // 2. Backend'den challenge al
        const apiUrl = __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        let challenge;
        try {
            const res = await fetch(`${apiUrl}/api/auth/challenge?address=${publicKey}`);
            if (!res.ok) {
                throw new Error(`Sunucu hatası: ${res.status}`);
            }
            const data = await res.json();
            challenge = data.challenge;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Sunucuya bağlanılamadı";
            setErrorMsg(msg);
            setStep("error");
            return;
        }
        // 3. Challenge'ı imzala
        const signature = await freighter.signChallenge(challenge);
        if (!signature) {
            setErrorMsg(freighter.error || "İmzalama iptal edildi veya başarısız");
            setStep("error");
            return;
        }
        setStep("verifying");
        // 4. NextAuth credentials provider ile giriş
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["signIn"])("credentials", {
            publicKey,
            signature,
            challenge,
            redirect: false
        });
        if (!result?.ok || result?.error) {
            setErrorMsg("Kimlik doğrulama başarısız");
            setStep("error");
            return;
        }
        router.push("/dashboard");
        router.refresh();
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col items-center gap-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold text-gray-900",
                        children: "dataEconomy'ye Giriş"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 93,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-sm text-gray-500",
                        children: "Stellar cüzdanınla güvenli, anonim giriş yap"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 96,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                lineNumber: 92,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-16 h-16 rounded-full bg-black flex items-center justify-center",
                "aria-hidden": "true",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-white text-2xl font-bold",
                    children: "XLM"
                }, void 0, false, {
                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                    lineNumber: 105,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-full space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$Button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        onClick: handleConnect,
                        variant: "primary",
                        size: "lg",
                        className: "w-full",
                        isLoading: isLoading,
                        disabled: isLoading,
                        "aria-busy": isLoading,
                        children: stepLabel[step]
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 109,
                        columnNumber: 9
                    }, this),
                    errorMsg && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        role: "alert",
                        className: "rounded-md bg-red-50 border border-red-200 p-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-red-700",
                            children: errorMsg
                        }, void 0, false, {
                            fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                            lineNumber: 126,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 122,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                lineNumber: 108,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center text-xs text-gray-400 space-y-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "Freighter yüklü değil mi?"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 132,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: "https://freighter.app",
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className: "text-blue-500 hover:underline",
                        children: "freighter.app üzerinden indir"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                        lineNumber: 133,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                lineNumber: 131,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-center text-xs text-gray-400",
                children: "Gerçek kimliğin saklanmaz — sadece anonim ID kullanılır"
            }, void 0, false, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
                lineNumber: 143,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/(auth)/login/page.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
_s(LoginPage, "ANrwk50nYnH//Ys5/cP7tt/9shM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$hooks$2f$useFreighter$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFreighter"]
    ];
});
_c = LoginPage;
var _c;
__turbopack_context__.k.register(_c, "LoginPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Desktop_dataEconomy_apps_web_src_b2ec44bf._.js.map