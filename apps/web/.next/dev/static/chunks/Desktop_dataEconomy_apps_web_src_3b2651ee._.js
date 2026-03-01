(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Desktop/dataEconomy/apps/web/src/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "apiFetch",
    ()=>apiFetch
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
const API_BASE = __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
async function apiFetch(path, options) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...options?.headers
        },
        ...options
    });
    if (!res.ok) {
        const error = await res.json().catch(()=>({
                error: res.statusText
            }));
        throw new Error(error.error || error.message || `API error: ${res.status}`);
    }
    return res.json();
}
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
"[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TasksPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next-auth/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/src/lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$Button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/dataEconomy/apps/web/src/components/ui/Button.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function TasksPage() {
    _s();
    const { data: session, status } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSession"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [tasks, setTasks] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [actionLoading, setActionLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TasksPage.useEffect": ()=>{
            if (status === "unauthenticated") router.push("/login");
        }
    }["TasksPage.useEffect"], [
        status,
        router
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TasksPage.useEffect": ()=>{
            if (status === "authenticated") {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/skills").then({
                    "TasksPage.useEffect": (data)=>{
                        setTasks((data.skills || []).map({
                            "TasksPage.useEffect": (s)=>({
                                    ...s,
                                    skillId: s.id,
                                    status: "pending",
                                    durationDays: 30
                                })
                        }["TasksPage.useEffect"]));
                    }
                }["TasksPage.useEffect"]).catch({
                    "TasksPage.useEffect": ()=>setTasks([])
                }["TasksPage.useEffect"]).finally({
                    "TasksPage.useEffect": ()=>setLoading(false)
                }["TasksPage.useEffect"]);
            }
        }
    }["TasksPage.useEffect"], [
        status
    ]);
    const handleDecision = async (skillId, decision)=>{
        if (!session?.user?.pseudoId) return;
        setActionLoading(skillId);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/consent/record", {
                method: "POST",
                body: JSON.stringify({
                    skillId,
                    pseudoId: session.user.pseudoId,
                    decision
                })
            });
            setTasks((prev)=>prev.map((t)=>t.skillId === skillId ? {
                        ...t,
                        status: decision === "ACCEPT" ? "accepted" : "rejected"
                    } : t));
        } catch  {
        // silently fail — could show toast
        } finally{
            setActionLoading(null);
        }
    };
    if (status === "loading" || loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "mx-auto max-w-3xl px-4 py-12",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "animate-pulse space-y-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-8 w-40 bg-gray-200 rounded"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 88,
                        columnNumber: 11
                    }, this),
                    [
                        1,
                        2,
                        3
                    ].map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-28 bg-gray-200 rounded-lg"
                        }, i, false, {
                            fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                            lineNumber: 90,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 87,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
            lineNumber: 86,
            columnNumber: 7
        }, this);
    }
    const pending = tasks.filter((t)=>t.status === "pending");
    const active = tasks.filter((t)=>t.status === "accepted" || t.status === "completed");
    const rejected = tasks.filter((t)=>t.status === "rejected");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mx-auto max-w-3xl px-4 py-12",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "text-2xl font-bold text-gray-900 mb-8",
                children: "Gorevler"
            }, void 0, false, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this),
            pending.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3",
                        children: [
                            "Bekleyen (",
                            pending.length,
                            ")"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-3",
                        children: pending.map((task)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-yellow-200 bg-yellow-50 p-4",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start justify-between",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    className: "text-sm font-semibold text-gray-900",
                                                    children: task.title
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                                    lineNumber: 121,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-gray-500 mt-1",
                                                    children: [
                                                        task.dataSource,
                                                        " — ",
                                                        task.metrics?.join(", "),
                                                        " —",
                                                        " ",
                                                        task.rewardPerUser,
                                                        " USDC"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                            lineNumber: 120,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex gap-2 ml-4",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$Button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    size: "sm",
                                                    variant: "primary",
                                                    isLoading: actionLoading === task.skillId,
                                                    onClick: ()=>handleDecision(task.skillId, "ACCEPT"),
                                                    children: "Kabul"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                                    lineNumber: 130,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$Button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    size: "sm",
                                                    variant: "outline",
                                                    isLoading: actionLoading === task.skillId,
                                                    onClick: ()=>handleDecision(task.skillId, "REJECT"),
                                                    children: "Red"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                                    lineNumber: 140,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                            lineNumber: 129,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                    lineNumber: 119,
                                    columnNumber: 17
                                }, this)
                            }, task.skillId, false, {
                                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                lineNumber: 115,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 113,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 109,
                columnNumber: 9
            }, this),
            active.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3",
                        children: [
                            "Aktif (",
                            active.length,
                            ")"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 161,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-3",
                        children: active.map((task)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-green-200 bg-green-50 p-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-sm font-semibold text-gray-900",
                                        children: task.title
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                        lineNumber: 170,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-gray-500 mt-1",
                                        children: [
                                            task.dataSource,
                                            " — ",
                                            task.rewardPerUser,
                                            " USDC — Kabul edildi, proof bekleniyor"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                        lineNumber: 173,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, task.skillId, true, {
                                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                lineNumber: 166,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 164,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 160,
                columnNumber: 9
            }, this),
            rejected.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3",
                        children: [
                            "Reddedilen (",
                            rejected.length,
                            ")"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 186,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-3",
                        children: rejected.map((task)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-gray-200 p-4 opacity-60",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-sm font-semibold text-gray-900",
                                        children: task.title
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                        lineNumber: 195,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-gray-500 mt-1",
                                        children: "Reddedildi"
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                        lineNumber: 198,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, task.skillId, true, {
                                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                                lineNumber: 191,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                        lineNumber: 189,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 185,
                columnNumber: 9
            }, this),
            tasks.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center py-16",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-gray-500",
                    children: "Henuz gorev yok."
                }, void 0, false, {
                    fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                    lineNumber: 207,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
                lineNumber: 206,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Desktop/dataEconomy/apps/web/src/app/tasks/page.tsx",
        lineNumber: 104,
        columnNumber: 5
    }, this);
}
_s(TasksPage, "NCmJ6y6pyjfwpd2HOr9G1f6AR7I=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSession"],
        __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$dataEconomy$2f$apps$2f$web$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = TasksPage;
var _c;
__turbopack_context__.k.register(_c, "TasksPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Desktop_dataEconomy_apps_web_src_3b2651ee._.js.map