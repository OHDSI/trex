(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,370410,885441,e=>{"use strict";let t=(0,e.i(388019).default)("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);e.s(["default",0,t],885441),e.s(["Check",0,t],370410)},375761,e=>{"use strict";var t=e.i(802715),r=e.i(355901);let n=async(e,n=t.default)=>{if(!window.document.hasFocus())return void r.toast.error("Unable to copy to clipboard");try{if("u">typeof ClipboardItem&&navigator.clipboard?.write){let t=new ClipboardItem({"text/plain":Promise.resolve(e).then(e=>new Blob([e],{type:"text/plain"}))}),r=()=>{},o=()=>{},i=new Promise((e,t)=>{r=e,o=t});return setTimeout(()=>{navigator.clipboard.write([t]).then(n).then(r).catch(o)},0),i}await Promise.resolve(e).then(e=>navigator.clipboard?.writeText(e)),n()}catch{r.toast.error("Unable to copy to clipboard")}};e.s(["copyToClipboard",0,n])},816467,e=>{"use strict";let t=(0,e.i(388019).default)("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",0,t],816467)},658367,(e,t,r)=>{var n={229:function(e){var t,r,n,o=e.exports={};function i(){throw Error("setTimeout has not been defined")}function a(){throw Error("clearTimeout has not been defined")}try{t="function"==typeof setTimeout?setTimeout:i}catch(e){t=i}try{r="function"==typeof clearTimeout?clearTimeout:a}catch(e){r=a}function s(e){if(t===setTimeout)return setTimeout(e,0);if((t===i||!t)&&setTimeout)return t=setTimeout,setTimeout(e,0);try{return t(e,0)}catch(r){try{return t.call(null,e,0)}catch(r){return t.call(this,e,0)}}}var l=[],u=!1,d=-1;function c(){u&&n&&(u=!1,n.length?l=n.concat(l):d=-1,l.length&&f())}function f(){if(!u){var e=s(c);u=!0;for(var t=l.length;t;){for(n=l,l=[];++d<t;)n&&n[d].run();d=-1,t=l.length}n=null,u=!1,function(e){if(r===clearTimeout)return clearTimeout(e);if((r===a||!r)&&clearTimeout)return r=clearTimeout,clearTimeout(e);try{r(e)}catch(t){try{return r.call(null,e)}catch(t){return r.call(this,e)}}}(e)}}function p(e,t){this.fun=e,this.array=t}function m(){}o.nextTick=function(e){var t=Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)t[r-1]=arguments[r];l.push(new p(e,t)),1!==l.length||u||s(f)},p.prototype.run=function(){this.fun.apply(null,this.array)},o.title="browser",o.browser=!0,o.env={},o.argv=[],o.version="",o.versions={},o.on=m,o.addListener=m,o.once=m,o.off=m,o.removeListener=m,o.removeAllListeners=m,o.emit=m,o.prependListener=m,o.prependOnceListener=m,o.listeners=function(e){return[]},o.binding=function(e){throw Error("process.binding is not supported")},o.cwd=function(){return"/"},o.chdir=function(e){throw Error("process.chdir is not supported")},o.umask=function(){return 0}}},o={};function i(e){var t=o[e];if(void 0!==t)return t.exports;var r=o[e]={exports:{}},a=!0;try{n[e](r,r.exports,i),a=!1}finally{a&&delete o[e]}return r.exports}i.ab="/ROOT/node_modules/.pnpm/next@16.2.6_@babel+core@7.29.0_supports-color@8.1.1__@opentelemetry+api@1.9.0_@playwrig_96ceb565d1471e9e697e3ab84c3e4dc9/node_modules/next/dist/compiled/process/",t.exports=i(229)},866644,(e,t,r)=>{"use strict";var n,o;t.exports=(null==(n=e.g.process)?void 0:n.env)&&"object"==typeof(null==(o=e.g.process)?void 0:o.env)?e.g.process:e.r(658367)},949401,(e,t,r)=>{"use strict";var n=Symbol.for("react.element"),o=Symbol.for("react.portal"),i=Symbol.for("react.fragment"),a=Symbol.for("react.strict_mode"),s=Symbol.for("react.profiler"),l=Symbol.for("react.provider"),u=Symbol.for("react.context"),d=Symbol.for("react.forward_ref"),c=Symbol.for("react.suspense"),f=Symbol.for("react.memo"),p=Symbol.for("react.lazy"),m=Symbol.iterator,h={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},b=Object.assign,g={};function x(e,t,r){this.props=e,this.context=t,this.refs=g,this.updater=r||h}function y(){}function v(e,t,r){this.props=e,this.context=t,this.refs=g,this.updater=r||h}x.prototype.isReactComponent={},x.prototype.setState=function(e,t){if("object"!=typeof e&&"function"!=typeof e&&null!=e)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")},x.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")},y.prototype=x.prototype;var w=v.prototype=new y;w.constructor=v,b(w,x.prototype),w.isPureReactComponent=!0;var _=Array.isArray,k=Object.prototype.hasOwnProperty,S={current:null},E={key:!0,ref:!0,__self:!0,__source:!0};function C(e,t,r){var o,i={},a=null,s=null;if(null!=t)for(o in void 0!==t.ref&&(s=t.ref),void 0!==t.key&&(a=""+t.key),t)k.call(t,o)&&!E.hasOwnProperty(o)&&(i[o]=t[o]);var l=arguments.length-2;if(1===l)i.children=r;else if(1<l){for(var u=Array(l),d=0;d<l;d++)u[d]=arguments[d+2];i.children=u}if(e&&e.defaultProps)for(o in l=e.defaultProps)void 0===i[o]&&(i[o]=l[o]);return{$$typeof:n,type:e,key:a,ref:s,props:i,_owner:S.current}}function T(e){return"object"==typeof e&&null!==e&&e.$$typeof===n}var R=/\/+/g;function z(e,t){var r,n;return"object"==typeof e&&null!==e&&null!=e.key?(r=""+e.key,n={"=":"=0",":":"=2"},"$"+r.replace(/[=:]/g,function(e){return n[e]})):t.toString(36)}function O(e,t,r){if(null==e)return e;var i=[],a=0;return!function e(t,r,i,a,s){var l,u,d,c=typeof t;("undefined"===c||"boolean"===c)&&(t=null);var f=!1;if(null===t)f=!0;else switch(c){case"string":case"number":f=!0;break;case"object":switch(t.$$typeof){case n:case o:f=!0}}if(f)return s=s(f=t),t=""===a?"."+z(f,0):a,_(s)?(i="",null!=t&&(i=t.replace(R,"$&/")+"/"),e(s,r,i,"",function(e){return e})):null!=s&&(T(s)&&(l=s,u=i+(!s.key||f&&f.key===s.key?"":(""+s.key).replace(R,"$&/")+"/")+t,s={$$typeof:n,type:l.type,key:u,ref:l.ref,props:l.props,_owner:l._owner}),r.push(s)),1;if(f=0,a=""===a?".":a+":",_(t))for(var p=0;p<t.length;p++){var h=a+z(c=t[p],p);f+=e(c,r,i,h,s)}else if("function"==typeof(h=null===(d=t)||"object"!=typeof d?null:"function"==typeof(d=m&&d[m]||d["@@iterator"])?d:null))for(t=h.call(t),p=0;!(c=t.next()).done;)h=a+z(c=c.value,p++),f+=e(c,r,i,h,s);else if("object"===c)throw Error("Objects are not valid as a React child (found: "+("[object Object]"===(r=String(t))?"object with keys {"+Object.keys(t).join(", ")+"}":r)+"). If you meant to render a collection of children, use an array instead.");return f}(e,i,"","",function(e){return t.call(r,e,a++)}),i}function $(e){if(-1===e._status){var t=e._result;(t=t()).then(function(t){(0===e._status||-1===e._status)&&(e._status=1,e._result=t)},function(t){(0===e._status||-1===e._status)&&(e._status=2,e._result=t)}),-1===e._status&&(e._status=0,e._result=t)}if(1===e._status)return e._result.default;throw e._result}var N={current:null},A={transition:null};function j(){throw Error("act(...) is not supported in production builds of React.")}r.Children={map:O,forEach:function(e,t,r){O(e,function(){t.apply(this,arguments)},r)},count:function(e){var t=0;return O(e,function(){t++}),t},toArray:function(e){return O(e,function(e){return e})||[]},only:function(e){if(!T(e))throw Error("React.Children.only expected to receive a single React element child.");return e}},r.Component=x,r.Fragment=i,r.Profiler=s,r.PureComponent=v,r.StrictMode=a,r.Suspense=c,r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED={ReactCurrentDispatcher:N,ReactCurrentBatchConfig:A,ReactCurrentOwner:S},r.act=j,r.cloneElement=function(e,t,r){if(null==e)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var o=b({},e.props),i=e.key,a=e.ref,s=e._owner;if(null!=t){if(void 0!==t.ref&&(a=t.ref,s=S.current),void 0!==t.key&&(i=""+t.key),e.type&&e.type.defaultProps)var l=e.type.defaultProps;for(u in t)k.call(t,u)&&!E.hasOwnProperty(u)&&(o[u]=void 0===t[u]&&void 0!==l?l[u]:t[u])}var u=arguments.length-2;if(1===u)o.children=r;else if(1<u){l=Array(u);for(var d=0;d<u;d++)l[d]=arguments[d+2];o.children=l}return{$$typeof:n,type:e.type,key:i,ref:a,props:o,_owner:s}},r.createContext=function(e){return(e={$$typeof:u,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null}).Provider={$$typeof:l,_context:e},e.Consumer=e},r.createElement=C,r.createFactory=function(e){var t=C.bind(null,e);return t.type=e,t},r.createRef=function(){return{current:null}},r.forwardRef=function(e){return{$$typeof:d,render:e}},r.isValidElement=T,r.lazy=function(e){return{$$typeof:p,_payload:{_status:-1,_result:e},_init:$}},r.memo=function(e,t){return{$$typeof:f,type:e,compare:void 0===t?null:t}},r.startTransition=function(e){var t=A.transition;A.transition={};try{e()}finally{A.transition=t}},r.unstable_act=j,r.useCallback=function(e,t){return N.current.useCallback(e,t)},r.useContext=function(e){return N.current.useContext(e)},r.useDebugValue=function(){},r.useDeferredValue=function(e){return N.current.useDeferredValue(e)},r.useEffect=function(e,t){return N.current.useEffect(e,t)},r.useId=function(){return N.current.useId()},r.useImperativeHandle=function(e,t,r){return N.current.useImperativeHandle(e,t,r)},r.useInsertionEffect=function(e,t){return N.current.useInsertionEffect(e,t)},r.useLayoutEffect=function(e,t){return N.current.useLayoutEffect(e,t)},r.useMemo=function(e,t){return N.current.useMemo(e,t)},r.useReducer=function(e,t,r){return N.current.useReducer(e,t,r)},r.useRef=function(e){return N.current.useRef(e)},r.useState=function(e){return N.current.useState(e)},r.useSyncExternalStore=function(e,t,r){return N.current.useSyncExternalStore(e,t,r)},r.useTransition=function(){return N.current.useTransition()},r.version="18.3.1"},389959,(e,t,r)=>{"use strict";t.exports=e.r(949401)},256711,(e,t,r)=>{"use strict";var n=e.r(389959),o=Symbol.for("react.element"),i=Symbol.for("react.fragment"),a=Object.prototype.hasOwnProperty,s=n.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,l={key:!0,ref:!0,__self:!0,__source:!0};function u(e,t,r){var n,i={},u=null,d=null;for(n in void 0!==r&&(u=""+r),void 0!==t.key&&(u=""+t.key),void 0!==t.ref&&(d=t.ref),t)a.call(t,n)&&!l.hasOwnProperty(n)&&(i[n]=t[n]);if(e&&e.defaultProps)for(n in t=e.defaultProps)void 0===i[n]&&(i[n]=t[n]);return{$$typeof:o,type:e,key:u,ref:d,props:i,_owner:s.current}}r.Fragment=i,r.jsx=u,r.jsxs=u},478902,(e,t,r)=>{"use strict";t.exports=e.r(256711)},802715,(e,t,r)=>{t.exports=function(){}},116317,e=>{"use strict";var t=e.i(389959),r=(e,t,r,n,o,i,a,s)=>{let l=document.documentElement,u=["light","dark"];function d(t){var r;(Array.isArray(e)?e:[e]).forEach(e=>{let r="class"===e,n=r&&i?o.map(e=>i[e]||e):o;r?(l.classList.remove(...n),l.classList.add(i&&i[t]?i[t]:t)):l.setAttribute(e,t)}),r=t,s&&u.includes(r)&&(l.style.colorScheme=r)}if(n)d(n);else try{let e=localStorage.getItem(t)||r,n=a&&"system"===e?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":e;d(n)}catch(e){}},n=["light","dark"],o="(prefers-color-scheme: dark)",i="u"<typeof window,a=t.createContext(void 0),s={setTheme:e=>{},themes:[]},l=["light","dark"],u=({forcedTheme:e,disableTransitionOnChange:r=!1,enableSystem:i=!0,enableColorScheme:s=!0,storageKey:u="theme",themes:m=l,defaultTheme:h=i?"system":"light",attribute:b="data-theme",value:g,children:x,nonce:y,scriptProps:v})=>{let[w,_]=t.useState(()=>c(u,h)),[k,S]=t.useState(()=>"system"===w?p():w),E=g?Object.values(g):m,C=t.useCallback(e=>{let t=e;if(!t)return;"system"===e&&i&&(t=p());let o=g?g[t]:t,a=r?f(y):null,l=document.documentElement,u=e=>{"class"===e?(l.classList.remove(...E),o&&l.classList.add(o)):e.startsWith("data-")&&(o?l.setAttribute(e,o):l.removeAttribute(e))};if(Array.isArray(b)?b.forEach(u):u(b),s){let e=n.includes(h)?h:null,r=n.includes(t)?t:e;l.style.colorScheme=r}null==a||a()},[y]),T=t.useCallback(e=>{let t="function"==typeof e?e(w):e;_(t);try{localStorage.setItem(u,t)}catch(e){}},[w]),R=t.useCallback(t=>{S(p(t)),"system"===w&&i&&!e&&C("system")},[w,e]);t.useEffect(()=>{let e=window.matchMedia(o);return e.addListener(R),R(e),()=>e.removeListener(R)},[R]),t.useEffect(()=>{let e=e=>{e.key===u&&(e.newValue?_(e.newValue):T(h))};return window.addEventListener("storage",e),()=>window.removeEventListener("storage",e)},[T]),t.useEffect(()=>{C(null!=e?e:w)},[e,w]);let z=t.useMemo(()=>({theme:w,setTheme:T,forcedTheme:e,resolvedTheme:"system"===w?k:w,themes:i?[...m,"system"]:m,systemTheme:i?k:void 0}),[w,T,e,k,i,m]);return t.createElement(a.Provider,{value:z},t.createElement(d,{forcedTheme:e,storageKey:u,attribute:b,enableSystem:i,enableColorScheme:s,defaultTheme:h,value:g,themes:m,nonce:y,scriptProps:v}),x)},d=t.memo(({forcedTheme:e,storageKey:n,attribute:o,enableSystem:i,enableColorScheme:a,defaultTheme:s,value:l,themes:u,nonce:d,scriptProps:c})=>{let f=JSON.stringify([o,n,s,e,u,l,i,a]).slice(1,-1);return t.createElement("script",{...c,suppressHydrationWarning:!0,nonce:"u"<typeof window?d:"",dangerouslySetInnerHTML:{__html:`(${r.toString()})(${f})`}})}),c=(e,t)=>{let r;if(!i){try{r=localStorage.getItem(e)||void 0}catch(e){}return r||t}},f=e=>{let t=document.createElement("style");return e&&t.setAttribute("nonce",e),t.appendChild(document.createTextNode("*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}")),document.head.appendChild(t),()=>{window.getComputedStyle(document.body),setTimeout(()=>{document.head.removeChild(t)},1)}},p=e=>(e||(e=window.matchMedia(o)),e.matches?"dark":"light");e.s(["ThemeProvider",0,e=>t.useContext(a)?t.createElement(t.Fragment,null,e.children):t.createElement(u,{...e}),"useTheme",0,()=>{var e;return null!=(e=t.useContext(a))?e:s}])},546595,e=>{"use strict";var t=e.i(389959),r=e.i(971131),n=e.i(153545),o=e.i(478902),i=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","select","span","svg","ul"].reduce((e,r)=>{let i=(0,n.createSlot)(`Primitive.${r}`),a=t.forwardRef((e,t)=>{let{asChild:n,...a}=e;return"u">typeof window&&(window[Symbol.for("radix-ui")]=!0),(0,o.jsx)(n?i:r,{...a,ref:t})});return a.displayName=`Primitive.${r}`,{...e,[r]:a}},{});e.s(["Primitive",0,i,"dispatchDiscreteCustomEvent",0,function(e,t){e&&r.flushSync(()=>e.dispatchEvent(t))}])},274664,e=>{"use strict";var t=e.i(389959),r=e.i(478902);e.s(["createContext",0,function(e,n){let o=t.createContext(n),i=e=>{let{children:n,...i}=e,a=t.useMemo(()=>i,Object.values(i));return(0,r.jsx)(o.Provider,{value:a,children:n})};return i.displayName=e+"Provider",[i,function(r){let i=t.useContext(o);if(i)return i;if(void 0!==n)return n;throw Error(`\`${r}\` must be used within \`${e}\``)}]},"createContextScope",0,function(e,n=[]){let o=[],i=()=>{let r=o.map(e=>t.createContext(e));return function(n){let o=n?.[e]||r;return t.useMemo(()=>({[`__scope${e}`]:{...n,[e]:o}}),[n,o])}};return i.scopeName=e,[function(n,i){let a=t.createContext(i),s=o.length;o=[...o,i];let l=n=>{let{scope:o,children:i,...l}=n,u=o?.[e]?.[s]||a,d=t.useMemo(()=>l,Object.values(l));return(0,r.jsx)(u.Provider,{value:d,children:i})};return l.displayName=n+"Provider",[l,function(r,o){let l=o?.[e]?.[s]||a,u=t.useContext(l);if(u)return u;if(void 0!==i)return i;throw Error(`\`${r}\` must be used within \`${n}\``)}]},function(...e){let r=e[0];if(1===e.length)return r;let n=()=>{let n=e.map(e=>({useScope:e(),scopeName:e.scopeName}));return function(e){let o=n.reduce((t,{useScope:r,scopeName:n})=>{let o=r(e)[`__scope${n}`];return{...t,...o}},{});return t.useMemo(()=>({[`__scope${r.scopeName}`]:o}),[o])}};return n.scopeName=r.scopeName,n}(i,...n)]}])},174617,e=>{"use strict";"u">typeof window&&window.document&&window.document.createElement,e.s(["composeEventHandlers",0,function(e,t,{checkForDefaultPrevented:r=!0}={}){return function(n){if(e?.(n),!1===r||!n.defaultPrevented)return t?.(n)}}])},503867,e=>{"use strict";var t=e.i(389959),r=globalThis?.document?t.useLayoutEffect:()=>{};e.s(["useLayoutEffect",0,r])},826524,e=>{"use strict";var t=e.i(389959),r=e.i(503867);t[" useEffectEvent ".trim().toString()],t[" useInsertionEffect ".trim().toString()];var n=t[" useInsertionEffect ".trim().toString()]||r.useLayoutEffect;Symbol("RADIX:SYNC_STATE"),e.s(["useControllableState",0,function({prop:e,defaultProp:r,onChange:o=()=>{},caller:i}){let[a,s,l]=function({defaultProp:e,onChange:r}){let[o,i]=t.useState(e),a=t.useRef(o),s=t.useRef(r);return n(()=>{s.current=r},[r]),t.useEffect(()=>{a.current!==o&&(s.current?.(o),a.current=o)},[o,a]),[o,i,s]}({defaultProp:r,onChange:o}),u=void 0!==e,d=u?e:a;{let r=t.useRef(void 0!==e);t.useEffect(()=>{let e=r.current;if(e!==u){let t=u?"controlled":"uncontrolled";console.warn(`${i} is changing from ${e?"controlled":"uncontrolled"} to ${t}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`)}r.current=u},[u,i])}return[d,t.useCallback(t=>{if(u){let r="function"==typeof t?t(e):t;r!==e&&l.current?.(r)}else s(t)},[u,e,s,l])]}],826524)},889251,e=>{"use strict";var t=e.i(389959),r=e.i(678001),n=e.i(503867),o=e=>{var o;let a,s,{present:l,children:u}=e,d=function(e){var r,o;let[a,s]=t.useState(),l=t.useRef(null),u=t.useRef(e),d=t.useRef("none"),[c,f]=(r=e?"mounted":"unmounted",o={mounted:{UNMOUNT:"unmounted",ANIMATION_OUT:"unmountSuspended"},unmountSuspended:{MOUNT:"mounted",ANIMATION_END:"unmounted"},unmounted:{MOUNT:"mounted"}},t.useReducer((e,t)=>o[e][t]??e,r));return t.useEffect(()=>{let e=i(l.current);d.current="mounted"===c?e:"none"},[c]),(0,n.useLayoutEffect)(()=>{let t=l.current,r=u.current;if(r!==e){let n=d.current,o=i(t);e?f("MOUNT"):"none"===o||t?.display==="none"?f("UNMOUNT"):r&&n!==o?f("ANIMATION_OUT"):f("UNMOUNT"),u.current=e}},[e,f]),(0,n.useLayoutEffect)(()=>{if(a){let e,t=a.ownerDocument.defaultView??window,r=r=>{let n=i(l.current).includes(CSS.escape(r.animationName));if(r.target===a&&n&&(f("ANIMATION_END"),!u.current)){let r=a.style.animationFillMode;a.style.animationFillMode="forwards",e=t.setTimeout(()=>{"forwards"===a.style.animationFillMode&&(a.style.animationFillMode=r)})}},n=e=>{e.target===a&&(d.current=i(l.current))};return a.addEventListener("animationstart",n),a.addEventListener("animationcancel",r),a.addEventListener("animationend",r),()=>{t.clearTimeout(e),a.removeEventListener("animationstart",n),a.removeEventListener("animationcancel",r),a.removeEventListener("animationend",r)}}f("ANIMATION_END")},[a,f]),{isPresent:["mounted","unmountSuspended"].includes(c),ref:t.useCallback(e=>{l.current=e?getComputedStyle(e):null,s(e)},[])}}(l),c="function"==typeof u?u({present:d.isPresent}):t.Children.only(u),f=(0,r.useComposedRefs)(d.ref,(o=c,(s=(a=Object.getOwnPropertyDescriptor(o.props,"ref")?.get)&&"isReactWarning"in a&&a.isReactWarning)?o.ref:(s=(a=Object.getOwnPropertyDescriptor(o,"ref")?.get)&&"isReactWarning"in a&&a.isReactWarning)?o.props.ref:o.props.ref||o.ref));return"function"==typeof u||d.isPresent?t.cloneElement(c,{ref:f}):null};function i(e){return e?.animationName||"none"}o.displayName="Presence",e.s(["Presence",0,o])},904641,e=>{"use strict";var t=e.i(389959),r=e.i(503867),n=t[" useId ".trim().toString()]||(()=>void 0),o=0;e.s(["useId",0,function(e){let[i,a]=t.useState(n());return(0,r.useLayoutEffect)(()=>{e||a(e=>e??String(o++))},[e]),e||(i?`radix-${i}`:"")}])},746523,e=>{"use strict";var t=e.i(389959);e.s(["useCallbackRef",0,function(e){let r=t.useRef(e);return t.useEffect(()=>{r.current=e}),t.useMemo(()=>(...e)=>r.current?.(...e),[])}])},2664,e=>{"use strict";var t=e.i(389959);e.i(478902);var r=t.createContext(void 0);e.s(["useDirection",0,function(e){let n=t.useContext(r);return e||n||"ltr"}])},295047,e=>{"use strict";var t=e.i(389959),r=e.i(274664),n=e.i(678001),o=e.i(153545),i=e.i(478902),a=new WeakMap;function s(e,t){var r,n;let o,i,a;if("at"in Array.prototype)return Array.prototype.at.call(e,t);let s=(r=e,n=t,o=r.length,(a=(i=l(n))>=0?i:o+i)<0||a>=o?-1:a);return -1===s?void 0:e[s]}function l(e){return e!=e||0===e?0:Math.trunc(e)}(class e extends Map{#e;constructor(e){super(e),this.#e=[...super.keys()],a.set(this,!0)}set(e,t){return a.get(this)&&(this.has(e)?this.#e[this.#e.indexOf(e)]=e:this.#e.push(e)),super.set(e,t),this}insert(e,t,r){let n,o=this.has(t),i=this.#e.length,a=l(e),s=a>=0?a:i+a,u=s<0||s>=i?-1:s;if(u===this.size||o&&u===this.size-1||-1===u)return this.set(t,r),this;let d=this.size+ +!o;a<0&&s++;let c=[...this.#e],f=!1;for(let e=s;e<d;e++)if(s===e){let i=c[e];c[e]===t&&(i=c[e+1]),o&&this.delete(t),n=this.get(i),this.set(t,r)}else{f||c[e-1]!==t||(f=!0);let r=c[f?e:e-1],o=n;n=this.get(r),this.delete(r),this.set(r,o)}return this}with(t,r,n){let o=new e(this);return o.insert(t,r,n),o}before(e){let t=this.#e.indexOf(e)-1;if(!(t<0))return this.entryAt(t)}setBefore(e,t,r){let n=this.#e.indexOf(e);return -1===n?this:this.insert(n,t,r)}after(e){let t=this.#e.indexOf(e);if(-1!==(t=-1===t||t===this.size-1?-1:t+1))return this.entryAt(t)}setAfter(e,t,r){let n=this.#e.indexOf(e);return -1===n?this:this.insert(n+1,t,r)}first(){return this.entryAt(0)}last(){return this.entryAt(-1)}clear(){return this.#e=[],super.clear()}delete(e){let t=super.delete(e);return t&&this.#e.splice(this.#e.indexOf(e),1),t}deleteAt(e){let t=this.keyAt(e);return void 0!==t&&this.delete(t)}at(e){let t=s(this.#e,e);if(void 0!==t)return this.get(t)}entryAt(e){let t=s(this.#e,e);if(void 0!==t)return[t,this.get(t)]}indexOf(e){return this.#e.indexOf(e)}keyAt(e){return s(this.#e,e)}from(e,t){let r=this.indexOf(e);if(-1===r)return;let n=r+t;return n<0&&(n=0),n>=this.size&&(n=this.size-1),this.at(n)}keyFrom(e,t){let r=this.indexOf(e);if(-1===r)return;let n=r+t;return n<0&&(n=0),n>=this.size&&(n=this.size-1),this.keyAt(n)}find(e,t){let r=0;for(let n of this){if(Reflect.apply(e,t,[n,r,this]))return n;r++}}findIndex(e,t){let r=0;for(let n of this){if(Reflect.apply(e,t,[n,r,this]))return r;r++}return -1}filter(t,r){let n=[],o=0;for(let e of this)Reflect.apply(t,r,[e,o,this])&&n.push(e),o++;return new e(n)}map(t,r){let n=[],o=0;for(let e of this)n.push([e[0],Reflect.apply(t,r,[e,o,this])]),o++;return new e(n)}reduce(...e){let[t,r]=e,n=0,o=r??this.at(0);for(let r of this)o=0===n&&1===e.length?r:Reflect.apply(t,this,[o,r,n,this]),n++;return o}reduceRight(...e){let[t,r]=e,n=r??this.at(-1);for(let r=this.size-1;r>=0;r--){let o=this.at(r);n=r===this.size-1&&1===e.length?o:Reflect.apply(t,this,[n,o,r,this])}return n}toSorted(t){return new e([...this.entries()].sort(t))}toReversed(){let t=new e;for(let e=this.size-1;e>=0;e--){let r=this.keyAt(e),n=this.get(r);t.set(r,n)}return t}toSpliced(...t){let r=[...this.entries()];return r.splice(...t),new e(r)}slice(t,r){let n=new e,o=this.size-1;if(void 0===t)return n;t<0&&(t+=this.size),void 0!==r&&r>0&&(o=r-1);for(let e=t;e<=o;e++){let t=this.keyAt(e),r=this.get(t);n.set(t,r)}return n}every(e,t){let r=0;for(let n of this){if(!Reflect.apply(e,t,[n,r,this]))return!1;r++}return!0}some(e,t){let r=0;for(let n of this){if(Reflect.apply(e,t,[n,r,this]))return!0;r++}return!1}}),e.s(["createCollection",0,function(e){let a=e+"CollectionProvider",[s,l]=(0,r.createContextScope)(a),[u,d]=s(a,{collectionRef:{current:null},itemMap:new Map}),c=e=>{let{scope:r,children:n}=e,o=t.default.useRef(null),a=t.default.useRef(new Map).current;return(0,i.jsx)(u,{scope:r,itemMap:a,collectionRef:o,children:n})};c.displayName=a;let f=e+"CollectionSlot",p=(0,o.createSlot)(f),m=t.default.forwardRef((e,t)=>{let{scope:r,children:o}=e,a=d(f,r),s=(0,n.useComposedRefs)(t,a.collectionRef);return(0,i.jsx)(p,{ref:s,children:o})});m.displayName=f;let h=e+"CollectionItemSlot",b="data-radix-collection-item",g=(0,o.createSlot)(h),x=t.default.forwardRef((e,r)=>{let{scope:o,children:a,...s}=e,l=t.default.useRef(null),u=(0,n.useComposedRefs)(r,l),c=d(h,o);return t.default.useEffect(()=>(c.itemMap.set(l,{ref:l,...s}),()=>void c.itemMap.delete(l))),(0,i.jsx)(g,{...{[b]:""},ref:u,children:a})});return x.displayName=h,[{Provider:c,Slot:m,ItemSlot:x},function(r){let n=d(e+"CollectionConsumer",r);return t.default.useCallback(()=>{let e=n.collectionRef.current;if(!e)return[];let t=Array.from(e.querySelectorAll(`[${b}]`));return Array.from(n.itemMap.values()).sort((e,r)=>t.indexOf(e.ref.current)-t.indexOf(r.ref.current))},[n.collectionRef,n.itemMap])},l]}])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},n={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},o={accordion:{variants:{default:{base:`
          flex flex-col
          space-y-3
        `,container:`
          group
          first:rounded-tl-md first:rounded-tr-md
          last:rounded-bl-md last:rounded-br-md
          overflow-hidden
          will-change-transform
        `,trigger:`
          flex flex-row
          gap-3
          items-center
          w-full
          text-left
          cursor-pointer

          outline-hidden
          focus-visible:ring-1
          focus-visible:z-10
          ring-foreground-light
        `,content:`
          data-open:animate-slide-down
          data-closed:animate-slide-up
        `,panel:`
          py-3
        `},bordered:{base:`
          flex flex-col
          -space-y-px
        `,container:`
          group
          border
          border-default

          first:rounded-tl-md first:rounded-tr-md
          last:rounded-bl-md last:rounded-br-md
        `,trigger:`
          flex flex-row
          items-center
          px-6 py-4
          w-full
          text-left
          cursor-pointer

          font-medium
          text-base
          bg-transparent

          outline-hidden
          focus-visible:ring-1
          focus-visible:z-10
          ring-foreground-light

          transition-colors
          hover:bg-background

          overflow-hidden

          group-first:rounded-tl-md group-first:rounded-tr-md
          group-last:rounded-bl-md group-last:rounded-br-md
        `,content:`
          data-open:animate-slide-down
          data-closed:animate-slide-up
        `,panel:`
          px-6 py-3
          border-t border-strong
          bg-background
        `}},justified:"justify-between",chevron:{base:`
        text-foreground-lighter
        rotate-0
        group-state-open:rotate-180
        group-data-[state=open]:rotate-180
        ease-&lsqb;cubic-bezier(0.87,_0,_0.13,_1)&rsqb;
        transition-transform duration-300
        duration-200
      `,align:{left:"order-first",right:"order-last"}},animate:{enter:"transition-max-height ease-in-out duration-700 overflow-hidden",enterFrom:"max-h-0",enterTo:"max-h-screen",leave:"transition-max-height ease-in-out duration-300 overflow-hidden",leaveFrom:"max-h-screen",leaveTo:"max-h-0"}},alert:{base:`
      relative rounded-md border py-4 px-6
      flex space-x-4 items-start
    `,header:"block text-sm font-normal mb-1",description:"text-xs",variant:{danger:{base:"bg-red-200 text-red-1200 border-red-700",icon:"text-red-900",header:"text-red-1200",description:"text-red-1100"},warning:{base:"bg-amber-200 border-amber-700",icon:"text-amber-900",header:"text-amber-1200",description:"text-amber-1100"},info:{base:"bg-alternative border",icon:"text-foreground-lighter",header:"text-foreground",description:"text-foreground-light"},success:{base:"bg-brand-300 border-brand-400",icon:"text-brand",header:"text-brand-600",description:"text-brand-600"},neutral:{base:"bg-surface-100 border-default",icon:"text-foreground-muted",header:"text-foreground",description:"text-foreground-light"}},close:`
      absolute
      right-6 top-4
      p-0 m-0
      text-foreground-muted
      cursor-pointer transition ease-in-out
      bg-transparent border-transparent focus:outline-hidden
      opacity-50 hover:opacity-100`},card:{base:`
      bg-surface-100

      border
      ${r.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${r.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${r.border.secondary}
        `,base:`
        relative
        cursor-pointer
        text-foreground-lighter
        flex
        items-center
        space-x-2
        text-center
        transition
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
      `,inactive:`
        hover:text-foreground
      `,active:`
        !text-foreground
        border-b-2 border-foreground
      `},pills:{list:"flex space-x-1",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-sm
        border
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-background
        border-strong hover:border-foreground-muted
        text-foreground-muted hover:text-foreground
      `,active:`
        bg-selection
        text-foreground
        border-stronger
      `},"rounded-pills":{list:"flex flex-wrap gap-2",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-full
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-surface-200 hover:bg-surface-300
        hover:border-foreground-lighter
        text-foreground-lighter hover:text-foreground
      `,active:`
        bg-foreground
        text-background
        border-foreground
      `},block:"w-full flex items-center justify-center",size:{...n},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${r.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${r.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
      z-50
      bg-dash-sidebar
      flex flex-col
      fixed
      inset-y-0
      h-full lg:h-screen
      border-l
      shadow-xl
    `,header:`
      flex items-center
      space-y-1 py-4 px-4 bg-dash-sidebar sm:px-6
      border-b h-(--header-height)
    `,contents:`
      relative
      flex-1
      overflow-y-auto
    `,content:`
      px-4 sm:px-6
    `,footer:`
      flex justify-end gap-2
      p-4 bg-overlay
      border-t
    `,size:{medium:"w-screen max-w-md h-full",large:"w-screen max-w-2xl h-full",xlarge:"w-screen max-w-3xl h-full",xxlarge:"w-screen max-w-4xl h-full",xxxlarge:"w-screen max-w-5xl h-full",xxxxlarge:"w-screen max-w-6xl h-full"},align:{left:`
        left-0
        data-open:animate-panel-slide-left-out
        data-closed:animate-panel-slide-left-in
      `,right:`
        right-0
        data-open:animate-panel-slide-right-out
        data-closed:animate-panel-slide-right-in
      `},separator:`
      w-full
      h-px
      my-2
      bg-border
    `,overlay:`
      z-50
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,trigger:`
      border-none bg-transparent p-0 focus:ring-0
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...r.size.text}},label_optional:{base:"text-foreground-lighter",size:{...r.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...r.size.text}},label_before:{base:"text-foreground-lighter ",size:{...r.size.text}},label_after:{base:"text-foreground-lighter",size:{...r.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...r.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
      flex
      border-none
      rounded-sm
      bg-transparent
      p-0
      outline-hidden
      outline-offset-1
      transition-all
      focus:outline-4
      focus:outline-border-control
    `,content:`
      z-40
      bg-overlay
      border border-overlay
      rounded-sm
      shadow-lg
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
      min-w-fit

      origin-popover
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
    `,size:{tiny:"w-40",small:"w-48",medium:"w-64",large:"w-80",xlarge:"w-96",content:"w-auto"},header:`
      bg-surface-200
      space-y-1 py-1.5 px-3
      border-b border-overlay
    `,footer:`
      bg-surface-200
      py-1.5 px-3
      border-t border-overlay
    `,close:`
      transition
      text-foreground-lighter
    `,separator:`
      w-full
      h-px
      my-2
      bg-border-overlay
    `},menu:{item:{base:`
        cursor-pointer
        flex space-x-3 items-center
        outline-hidden
        focus-visible:ring-1 ring-foreground-muted focus-visible:z-10
        group
      `,content:{base:"transition truncate text-sm w-full",normal:"text-foreground-light group-hover:text-foreground",active:"text-foreground font-semibold"},icon:{base:"transition truncate text-sm",normal:"text-foreground-lighter group-hover:text-foreground-light",active:"text-foreground"},variants:{text:{base:`
            py-1
          `,normal:`
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold
            text-foreground-muted
            z-10
          `},border:{base:`
            px-4 py-1
          `,normal:`
            border-l
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold

            text-foreground-muted
            z-10

            border-l
            border-brand
            group-hover:border-brand
          `,rounded:"rounded-md"},pills:{base:"my-px px-3 py-[3px] rounded-md transition-colors active:bg-sidebar-accent/50",normal:`
            font-normal
            border-default
            hover:bg-sidebar-accent/50
            group-hover:border-foreground-muted`,active:`
            font-semibold
            bg-sidebar-accent
            text-foreground-lighter
            z-10 rounded-md
          `}}},group:{base:`
        flex space-x-3
        mb-2
        font-normal
      `,icon:"text-foreground-lighter",content:"text-sm text-foreground-lighter w-full",variants:{text:"",pills:"px-3",border:""}}},modal:{base:`
      relative
      bg-dash-sidebar
      my-4 max-w-screen
      border border-overlay
      rounded-md
      shadow-xl
      data-open:animate-overlay-show
      data-closed:animate-overlay-hide

    `,header:`
      bg-surface-200
      space-y-1 py-3 px-4 sm:px-5
      border-b border-overlay
      flex items-center justify-between
    `,footer:`
      flex justify-end gap-2
      py-3 px-5
      border-t border-overlay
    `,size:{tiny:"sm:align-middle sm:w-full sm:max-w-xs",small:"sm:align-middle sm:w-full sm:max-w-sm",medium:"sm:align-middle sm:w-full sm:max-w-lg",large:"sm:align-middle sm:w-full md:max-w-xl",xlarge:"sm:align-middle sm:w-full md:max-w-3xl",xxlarge:"sm:align-middle sm:w-full max-w-screen md:max-w-6xl",xxxlarge:"sm:align-middle sm:w-full md:max-w-7xl"},overlay:`
      z-40
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,scroll_overlay:`
      z-40
      fixed
      inset-0
      grid
      place-items-center
      overflow-y-auto
      data-open:animate-overlay-show data-closed:animate-overlay-hide
    `,separator:`
      w-full
      h-px
      my-2
      bg-border-overlay
    `,content:"px-5"},listbox:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      text-foreground
      border
      focus-visible:shadow-md
      ${r.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${r.placeholder}
      indent-px
      transition-all
      bg-none
    `,container:"relative",label:"truncate",variants:{standard:`
        bg-control
        border border-control

        aria-expanded:border-foreground-muted
        aria-expanded:ring-border-muted
        aria-expanded:ring-2
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},options_container_animate:`
      transition
      data-open:animate-slide-down
      data-open:opacity-1
      data-closed:animate-slide-up
      data-closed:opacity-0
    `,options_container:`
      bg-overlay
      shadow-lg
      border border-solid
      border-overlay max-h-60
      rounded-md py-1 text-base
      sm:text-sm z-10 overflow-hidden overflow-y-scroll

      origin-dropdown
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
    `,with_icon:"pl-2",addOnBefore:`
      w-full flex flex-row items-center space-x-3
    `,size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
      w-listbox
      transition cursor-pointer select-none relative py-2 pl-3 pr-9
      text-foreground-light
      text-sm
      hover:bg-border-overlay
      focus:bg-border-overlay
      focus:text-foreground
      border-none
      focus:outline-hidden
    `,option_active:"text-foreground bg-selection",option_disabled:"cursor-not-allowed opacity-60",option_inner:"flex items-center space-x-3",option_check:"absolute inset-y-0 right-0 flex items-center pr-3 text-brand",option_check_active:"text-brand",option_check_icon:"h-5 w-5"},collapsible:{content:`
      data-open:animate-slide-down-normal
      data-closed:animate-slide-up-normal
    `},inputErrorIcon:{base:`
      flex items-center
      right-3 pr-2 pl-2
      inset-y-0
      pointer-events-none
      text-red-900
    `},inputIconContainer:{base:`
    absolute inset-y-0
    left-0 pl-2 flex
    items-center pointer-events-none
    text-foreground-light
    [&_svg]:stroke-[1.5]
    `,size:{tiny:"[&_svg]:h-[14px] [&_svg]:w-[14px]",small:"[&_svg]:h-[18px] [&_svg]:w-[18px]",medium:"[&_svg]:h-[20px] [&_svg]:w-[20px]",large:"[&_svg]:h-[20px] [&_svg]:w-[20px] pl-3",xlarge:"[&_svg]:h-[24px] [&_svg]:w-[24px] pl-3",xxlarge:"[&_svg]:h-[30px] [&_svg]:w-[30px] pl-3",xxxlarge:"[&_svg]:h-[42px] [&_svg]:w-[42px] pl-3"}},icon:{container:"shrink-0 flex items-center justify-center rounded-full p-3"},loading:{base:"relative",content:{base:"transition-opacity duration-300",active:"opacity-40"},spinner:`
      absolute
      text-foreground-lighter animate-spin
      inset-0
      size-5
      m-auto
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)}]);