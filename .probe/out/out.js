//#region packages/core/src/input/UiInputEvent.ts
var e = Object.freeze({
	id: 1,
	kind: "mouse"
});
function t(e) {
	let t = e.wheelDeltaY;
	return typeof t == "number" && Number.isFinite(t) ? t : void 0;
}
//#endregion
//#region packages/core/src/environment/UiInsets.ts
var n = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0
};
function r(e, t) {
	return e.top === t.top && e.right === t.right && e.bottom === t.bottom && e.left === t.left;
}
function i(e) {
	let t = globalThis, i = t.visualViewport;
	if (i === void 0) return e(n), () => {};
	let o = null, s = () => {
		let n = a(t), s = Math.max(0, (t.innerHeight ?? i.height) - i.height - i.offsetTop), c = {
			top: n.top,
			right: n.right,
			bottom: Math.max(n.bottom, s),
			left: n.left
		};
		(o === null || !r(o, c)) && (o = c, e(c));
	};
	return s(), i.addEventListener("resize", s), i.addEventListener("scroll", s), () => {
		i.removeEventListener("resize", s), i.removeEventListener("scroll", s);
	};
}
function a(e) {
	let t = e.document?.documentElement;
	if (t === void 0 || typeof e.getComputedStyle != "function") return n;
	let r = e.getComputedStyle(t);
	return {
		top: o(r.getPropertyValue("--gesso-safe-area-top")),
		right: o(r.getPropertyValue("--gesso-safe-area-right")),
		bottom: o(r.getPropertyValue("--gesso-safe-area-bottom")),
		left: o(r.getPropertyValue("--gesso-safe-area-left"))
	};
}
function o(e) {
	let t = Number.parseFloat(e);
	return Number.isFinite(t) && t > 0 ? t : 0;
}
//#endregion
//#region packages/core/src/input/UiPlatformAdapter.ts
function s(t) {
	let n = t.pointerType;
	return n !== "touch" && n !== "pen" && n !== "mouse" ? e : {
		id: t.pointerId,
		kind: n
	};
}
function c(e, t) {
	let n = e;
	if (typeof n?.setPointerCapture == "function") try {
		n.setPointerCapture(t);
	} catch {}
}
function l(e) {
	let t = e.style;
	t.touchAction = "none", t.userSelect = "none", t.setProperty("-webkit-user-select", "none"), t.setProperty("-webkit-touch-callout", "none"), t.setProperty("-webkit-tap-highlight-color", "transparent"), t.outline = "none", e.addEventListener("contextmenu", u);
}
function u(e) {
	e.preventDefault();
}
function d(e) {
	return e ? "none" : "auto";
}
//#endregion
//#region packages/framework/src/worker/captureConsole.ts
function f(e) {
	let t = e;
	return t?.type === "gesso:console" && typeof t.entry == "object" && t.entry !== null;
}
//#endregion
//#region packages/framework/src/worker/WorkerPorts.ts
function p(e) {
	return {
		open(t) {
			let n = new MessageChannel();
			return e.postMessage({
				type: "gesso:port",
				key: t
			}, [n.port2]), n.port1;
		},
		get spawned() {
			return !0;
		},
		terminate() {}
	};
}
//#endregion
//#region packages/framework/src/app/worker/RenderWorkerProtocol.ts
var m = /* @__PURE__ */ new Set([
	"pointerDown",
	"pointerMove",
	"pointerUp",
	"pointerCancel",
	"wheel",
	"keyDown",
	"keyUp",
	"beforeInput",
	"compositionStart",
	"compositionUpdate",
	"compositionEnd",
	"paste"
]);
function h(e) {
	return m.has(e.type);
}
function g() {
	return typeof performance > "u" ? Date.now() : performance.timeOrigin + performance.now();
}
function _(e) {
	return typeof performance > "u" ? Date.now() : performance.timeOrigin + e.timeStamp;
}
function v(e) {
	return {
		shift: e.shiftKey,
		ctrl: e.ctrlKey,
		alt: e.altKey,
		meta: e.metaKey
	};
}
//#endregion
//#region packages/framework/src/app/AudioSink.ts
var y = 1e3, b = [
	"loadstart",
	"loadedmetadata",
	"durationchange",
	"canplay",
	"playing",
	"play",
	"pause",
	"seeking",
	"seeked",
	"waiting",
	"stalled",
	"ended",
	"error",
	"progress",
	"emptied"
], x = class {
	out;
	element;
	spare;
	prepared = "";
	session;
	sampleEveryMs;
	timer = null;
	waiting = !1;
	refused;
	onEvent = (e) => this.handleEvent(e.type);
	constructor(e, t = {}) {
		this.out = e;
		let n = t.createElement ?? (() => new Audio());
		this.element = n(), this.element.preload = "auto", this.spare = n(), this.spare.preload = "auto", this.session = t.mediaSession === void 0 ? typeof navigator < "u" && "mediaSession" in navigator ? navigator.mediaSession : null : t.mediaSession, this.sampleEveryMs = t.sampleEveryMs ?? y;
		for (let e of b) this.element.addEventListener(e, this.onEvent);
		this.bindSession();
	}
	handle(e) {
		switch (e.type) {
			case "load":
				this.prepared !== "" && this.prepared === e.src ? this.swap() : (this.element.src = e.src, this.element.load()), this.waiting = !0, e.autoplay ? this.play() : this.emit();
				return;
			case "preload":
				this.preload(e.src);
				return;
			case "play":
				this.play();
				return;
			case "pause":
				this.element.pause();
				return;
			case "seek":
				this.element.currentTime = e.seconds;
				return;
			case "volume":
				this.element.volume = e.level;
				return;
			case "metadata":
				this.setMetadata(e.metadata);
				return;
		}
	}
	preload(e) {
		if (e !== this.prepared) {
			if (this.prepared = e, e === "") {
				this.spare.pause(), this.spare.src = "";
				return;
			}
			this.spare.volume = this.element.volume, this.spare.src = e, this.spare.load();
		}
	}
	swap() {
		for (let e of b) this.element.removeEventListener(e, this.onEvent);
		let e = this.element;
		this.element = this.spare, this.spare = e, this.prepared = "", this.spare.pause(), this.spare.src = "";
		for (let e of b) this.element.addEventListener(e, this.onEvent);
	}
	dispose() {
		this.stopTimer();
		for (let e of b) this.element.removeEventListener(e, this.onEvent);
		if (this.element.pause(), this.element.src = "", this.spare.pause(), this.spare.src = "", this.session !== null) {
			for (let e of [
				"play",
				"pause",
				"previoustrack",
				"nexttrack",
				"seekto"
			]) try {
				this.session.setActionHandler(e, null);
			} catch {}
			this.session.metadata = null, this.session.playbackState = "none";
		}
	}
	play() {
		this.refused = void 0, this.element.play()?.catch((e) => {
			this.waiting = !1, this.refused = e instanceof Error ? e.name : String(e), this.emit();
		});
	}
	handleEvent(e) {
		switch (e) {
			case "loadstart":
			case "waiting":
			case "stalled":
				this.waiting = !0;
				break;
			case "canplay":
			case "playing":
			case "pause":
			case "ended":
			case "error":
			case "emptied": this.waiting = !1;
		}
		this.emit();
	}
	status() {
		let e = this.element;
		return e.error === null ? e.src === "" || e.src === void 0 ? "idle" : e.ended ? "ended" : e.paused ? this.waiting && this.refused === void 0 ? "loading" : "paused" : this.waiting ? "loading" : "playing" : "error";
	}
	emit() {
		let e = this.element, t = this.status(), n = t === "error" ? e.error?.message ?? `media error ${e.error?.code ?? ""}`.trim() : this.refused;
		this.out.sample({
			status: t,
			position: e.currentTime,
			duration: e.duration,
			buffered: S(e),
			at: g(),
			...n === void 0 ? {} : { error: n }
		}), this.session !== null && (this.session.playbackState = t === "playing" ? "playing" : t === "idle" ? "none" : "paused"), t === "playing" ? this.startTimer() : this.stopTimer();
	}
	startTimer() {
		this.timer === null && (this.timer = setInterval(() => this.emit(), this.sampleEveryMs));
	}
	stopTimer() {
		this.timer !== null && (clearInterval(this.timer), this.timer = null);
	}
	setMetadata(e) {
		if (this.session !== null) {
			if (e === null || typeof MediaMetadata > "u") {
				this.session.metadata = null;
				return;
			}
			this.session.metadata = new MediaMetadata({
				title: e.title,
				artist: e.artist,
				album: e.album ?? "",
				artwork: e.artwork === void 0 ? [] : [{ src: e.artwork }]
			});
		}
	}
	bindSession() {
		let e = this.session;
		if (e === null) return;
		let t = (t, n) => {
			try {
				e.setActionHandler(t, n);
			} catch {}
		};
		t("play", () => {
			this.play(), this.out.action("play");
		}), t("pause", () => {
			this.element.pause(), this.out.action("pause");
		}), t("previoustrack", () => this.out.action("previous")), t("nexttrack", () => this.out.action("next")), t("seekto", (e) => {
			e.seekTime !== void 0 && (this.element.currentTime = e.seekTime);
		});
	}
};
function S(e) {
	let t = e.buffered, n = e.currentTime;
	for (let e = 0; e < t.length; e++) if (t.start(e) <= n && n <= t.end(e)) return t.end(e);
	return n;
}
//#endregion
//#region packages/framework/src/app/EditingProxy.ts
var C = /* @__PURE__ */ new Set([
	"insertCompositionText",
	"insertFromComposition",
	"deleteCompositionText"
]), w = /* @__PURE__ */ new Set([
	"deleteContentBackward",
	"deleteContentForward",
	"deleteWordBackward",
	"deleteWordForward",
	"deleteSoftLineBackward",
	"deleteSoftLineForward",
	"deleteHardLineBackward",
	"deleteHardLineForward",
	"insertLineBreak",
	"insertParagraph",
	"historyUndo",
	"historyRedo"
]), T = class {
	canvas;
	sink;
	textarea;
	doc;
	view;
	state = null;
	composing = !1;
	disposed = !1;
	refocusing = !1;
	detach;
	constructor(e, t) {
		this.canvas = e, this.sink = t, this.doc = e.ownerDocument, this.view = this.doc.defaultView;
		let n = this.doc.createElement("textarea");
		this.textarea = n, n.setAttribute("aria-hidden", "true"), n.setAttribute("autocomplete", "off"), n.setAttribute("autocorrect", "off"), n.setAttribute("autocapitalize", "off"), n.setAttribute("spellcheck", "false"), n.setAttribute("wrap", "off"), n.tabIndex = -1, Object.assign(n.style, {
			position: "fixed",
			left: "0px",
			top: "0px",
			width: "1px",
			height: "1em",
			margin: "0",
			padding: "0",
			border: "0",
			outline: "none",
			opacity: "0",
			overflow: "hidden",
			resize: "none",
			whiteSpace: "pre",
			pointerEvents: "none",
			zIndex: "2147483647"
		}), this.doc.body.appendChild(n), this.detach = this.listen();
	}
	get active() {
		return this.state !== null;
	}
	get element() {
		return this.textarea;
	}
	update(e) {
		if (this.disposed) return;
		let t = this.state !== null;
		if (this.state = e, e === null) {
			t && this.doc.activeElement === this.textarea && (this.textarea.blur(), this.canvas.focus({ preventScroll: !0 }));
			return;
		}
		if (this.position(e), this.mirror(e), this.textarea.setAttribute("enterkeyhint", e.multiline ? "enter" : "done"), !t || this.doc.activeElement !== this.textarea) {
			let e = this.doc.activeElement;
			(e === null || e === this.doc.body || e === this.canvas || e === this.textarea) && this.textarea.focus({ preventScroll: !0 });
		}
	}
	focus() {
		this.disposed || this.state === null || this.doc.activeElement === this.textarea || this.textarea.focus({ preventScroll: !0 });
	}
	raiseKeyboard() {
		if (this.disposed || this.state === null) return;
		let e = this.textarea;
		if (this.doc.activeElement !== e) {
			e.focus({ preventScroll: !0 });
			return;
		}
		this.refocusing = !0;
		try {
			e.blur(), e.focus({ preventScroll: !0 });
		} finally {
			this.refocusing = !1;
		}
	}
	describe(e) {
		if (this.disposed) return;
		let t = this.textarea;
		if (e === null) {
			t.setAttribute("aria-hidden", "true");
			for (let e of [
				"role",
				"aria-label",
				"aria-description",
				"aria-required",
				"aria-invalid",
				"aria-readonly",
				"aria-disabled"
			]) t.removeAttribute(e);
			return;
		}
		t.removeAttribute("aria-hidden"), O(t, "role", e.role), O(t, "aria-label", e.label), O(t, "aria-description", e.description);
		let n = new Set(e.states ?? []);
		O(t, "aria-required", n.has("required") ? "true" : void 0), O(t, "aria-invalid", n.has("invalid") ? "true" : void 0), O(t, "aria-readonly", n.has("readonly") ? "true" : void 0), O(t, "aria-disabled", e.disabled === !0 ? "true" : void 0);
	}
	dispose() {
		this.disposed || (this.disposed = !0, this.detach(), this.state = null, this.textarea.remove());
	}
	position(e) {
		let t = this.canvas.getBoundingClientRect(), n = Math.max(1, e.caret.height), r = t.left + Math.min(Math.max(0, e.caret.x), Math.max(0, t.width - 1)), i = t.top + Math.min(Math.max(0, e.caret.y), Math.max(0, t.height - n)), a = this.textarea.style;
		a.left = `${r}px`, a.top = `${i}px`, a.height = `${n}px`, a.fontSize = `${Math.max(1, Math.round(n * .75))}px`, a.lineHeight = `${n}px`;
	}
	mirror(e) {
		if (this.composing) return;
		let t = this.textarea;
		if (t.value !== e.text && (t.value = e.text), t.selectionStart !== e.selectionStart || t.selectionEnd !== e.selectionEnd) try {
			t.setSelectionRange(e.selectionStart, e.selectionEnd);
		} catch {}
	}
	listen() {
		let e = this.textarea, t = (e) => {
			let t = e, n = t.inputType;
			C.has(n) || this.composing || (e.preventDefault(), !(w.has(n) || n === "insertFromPaste") && this.sink.beforeInput(n, t.data ?? null));
		}, n = () => {
			this.composing = !0, e.value = "", this.sink.compositionStart();
		}, r = () => {
			if (!this.composing) return;
			let t = e.value, n = e.selectionStart ?? t.length;
			this.sink.compositionUpdate(t, Math.max(0, Math.min(n, t.length)));
		}, i = (t) => {
			if (!this.composing) return;
			this.composing = !1;
			let n = t.data ?? e.value;
			this.sink.compositionEnd(n), this.state !== null && this.mirror(this.state);
		}, a = (e) => {
			let t = e.clipboardData;
			e.preventDefault();
			let n = t?.getData("text/plain") ?? "";
			n.length > 0 && this.sink.paste(n);
		}, o = (t) => {
			this.doc.activeElement !== e && a(t);
		}, s = (e) => {
			let t = e.clipboardData, n = this.state;
			t !== null && n !== null && (e.preventDefault(), t.setData("text/plain", n.text.slice(n.selectionStart, n.selectionEnd)));
		}, c = (e) => {
			let t = this.state;
			s(e), t !== null && t.selectionEnd > t.selectionStart && this.sink.beforeInput("deleteByCut", null);
		}, l = (e) => {
			this.sink.keyDown?.(e);
		}, u = (e) => {
			this.sink.keyUp?.(e);
		}, d = (e) => {
			if (this.refocusing) return;
			let t = e.relatedTarget;
			this.state !== null && this.doc.hasFocus() && t !== this.canvas && this.sink.blur();
		}, f = () => {
			this.state !== null && this.position(this.state);
		};
		return e.addEventListener("beforeinput", t), e.addEventListener("compositionstart", n), e.addEventListener("input", r), e.addEventListener("compositionend", i), e.addEventListener("paste", a), e.addEventListener("copy", s), e.addEventListener("cut", c), e.addEventListener("keydown", l), this.canvas.addEventListener("paste", o), e.addEventListener("keyup", u), e.addEventListener("blur", d), this.view?.addEventListener("scroll", f, {
			capture: !0,
			passive: !0
		}), this.view?.addEventListener("resize", f), () => {
			e.removeEventListener("beforeinput", t), e.removeEventListener("compositionstart", n), e.removeEventListener("input", r), e.removeEventListener("compositionend", i), e.removeEventListener("paste", a), e.removeEventListener("copy", s), e.removeEventListener("cut", c), e.removeEventListener("keydown", l), this.canvas.removeEventListener("paste", o), e.removeEventListener("keyup", u), e.removeEventListener("blur", d), this.view?.removeEventListener("scroll", f, { capture: !0 }), this.view?.removeEventListener("resize", f);
		};
	}
};
function E(e, t = document) {
	let n = typeof navigator < "u" ? navigator.clipboard : void 0;
	if (n !== void 0 && typeof n.writeText == "function") {
		n.writeText(e).catch(() => D(e, t));
		return;
	}
	D(e, t);
}
function D(e, t) {
	let n = t.activeElement, r = t.createElement("textarea");
	r.value = e, r.style.position = "fixed", r.style.opacity = "0", t.body.appendChild(r), r.select();
	try {
		t.execCommand("copy");
	} finally {
		r.remove(), n?.focus?.({ preventScroll: !0 });
	}
}
function O(e, t, n) {
	n === void 0 ? e.removeAttribute(t) : e.setAttribute(t, n);
}
//#endregion
//#region packages/framework/src/app/SemanticsMirror.ts
var ee = {
	checked: ["aria-checked", "true"],
	mixed: ["aria-checked", "mixed"],
	expanded: ["aria-expanded", "true"],
	collapsed: ["aria-expanded", "false"],
	selected: ["aria-selected", "true"],
	pressed: ["aria-pressed", "true"],
	busy: ["aria-busy", "true"],
	invalid: ["aria-invalid", "true"],
	required: ["aria-required", "true"],
	readonly: ["aria-readonly", "true"],
	modal: ["aria-modal", "true"]
}, k = /* @__PURE__ */ new Set([
	"checkbox",
	"radio",
	"switch",
	"menuitemcheckbox",
	"menuitemradio"
]), A = [
	"role",
	"aria-label",
	"aria-description",
	"aria-live",
	"aria-disabled",
	"aria-valuenow",
	"aria-valuemin",
	"aria-valuemax",
	"aria-valuetext",
	"aria-posinset",
	"aria-setsize",
	"aria-level",
	"aria-checked",
	"aria-expanded",
	"aria-selected",
	"aria-pressed",
	"aria-busy",
	"aria-invalid",
	"aria-required",
	"aria-readonly",
	"aria-modal"
], j = /* @__PURE__ */ new Set(["heading", "paragraph"]), M = /* @__PURE__ */ new Set(["status", "alert"]), N = /* @__PURE__ */ new Set(["textbox", "searchbox"]), P = class {
	canvas;
	sink;
	editing;
	container;
	doc;
	entries = /* @__PURE__ */ new Map();
	ids = /* @__PURE__ */ new WeakMap();
	detach;
	resizeObserver = null;
	stopTracking = null;
	applying = !1;
	focusedId = null;
	disposed = !1;
	constructor(e, t, n = null) {
		this.canvas = e, this.sink = t, this.editing = n, this.doc = e.ownerDocument;
		let r = this.doc.createElement("div");
		this.container = r, r.setAttribute("data-gesso-semantics", ""), Object.assign(r.style, {
			position: "fixed",
			left: "0px",
			top: "0px",
			width: "0px",
			height: "0px",
			pointerEvents: "none",
			overflow: "hidden",
			margin: "0",
			padding: "0",
			border: "0",
			color: "transparent",
			background: "transparent",
			font: "1px sans-serif",
			zIndex: "2147483646"
		}), this.doc.body.appendChild(r), this.detach = this.listen(), this.trackCanvas();
	}
	get element() {
		return this.container;
	}
	elementFor(e) {
		return this.entries.get(e)?.element;
	}
	apply(e) {
		if (this.disposed) return;
		for (let t of e.patches) t.op === "remove" ? this.remove(t.id) : this.upsert(t.node);
		let t = /* @__PURE__ */ new Set();
		for (let { id: n, box: r } of e.boxes) {
			let e = this.entries.get(n);
			e !== void 0 && (e.box = r, t.add(e));
		}
		for (let e of t) {
			this.position(e);
			let n = e.element.children;
			for (let e = 0; e < n.length; e += 1) {
				let r = this.ids.get(n[e]), i = r === void 0 ? void 0 : this.entries.get(r);
				i !== void 0 && i.box !== void 0 && !t.has(i) && this.position(i);
			}
		}
		e.focused !== void 0 && this.applyFocus(e.focused);
	}
	dispose() {
		this.disposed = !0, this.detach(), this.stopTracking?.(), this.stopTracking = null, this.resizeObserver?.disconnect(), this.resizeObserver = null, this.entries.clear(), this.container.remove();
	}
	upsert(e) {
		let t = this.entries.get(e.id), n = t?.element ?? this.createElement();
		t === void 0 ? (this.entries.set(e.id, {
			element: n,
			record: e
		}), this.ids.set(n, e.id)) : t.record = e, this.describe(n, e), this.place(n, e), t?.box !== void 0 && this.position(t), e.id === this.focusedId && this.editing?.describe(this.editing.active ? e : null);
	}
	createElement() {
		let e = this.doc.createElement("div");
		return e.tabIndex = -1, Object.assign(e.style, {
			position: "absolute",
			left: "0px",
			top: "0px",
			width: "0px",
			height: "0px",
			margin: "0",
			padding: "0",
			border: "0",
			outline: "none",
			overflow: "hidden",
			pointerEvents: "none",
			color: "transparent"
		}), e;
	}
	describe(e, t) {
		for (let t of A) e.removeAttribute(t);
		let n = t.label;
		t.role !== void 0 && e.setAttribute("role", t.role), n !== void 0 && t.role !== void 0 && !j.has(t.role) ? (e.setAttribute("aria-label", n), I(e, N.has(t.role) ? t.valueText ?? "" : M.has(t.role) ? n : "")) : I(e, n ?? ""), t.description !== void 0 && e.setAttribute("aria-description", t.description), t.live !== void 0 && e.setAttribute("aria-live", t.live), t.disabled === !0 && e.setAttribute("aria-disabled", "true");
		for (let n of t.states ?? []) {
			let t = ee[n];
			t !== void 0 && e.setAttribute(t[0], t[1]);
		}
		let r = (t.states ?? []).some((e) => e === "checked" || e === "mixed");
		t.role !== void 0 && k.has(t.role) && !r && e.setAttribute("aria-checked", "false"), F(e, "aria-valuenow", t.valueNow), F(e, "aria-valuemin", t.valueMin), F(e, "aria-valuemax", t.valueMax), F(e, "aria-posinset", t.posInSet), F(e, "aria-setsize", t.setSize), F(e, "aria-level", t.level), t.valueText !== void 0 && e.setAttribute("aria-valuetext", t.valueText);
	}
	place(e, t) {
		let n = t.parent === null ? this.container : this.entries.get(t.parent)?.element;
		if (n === void 0) return;
		let r = n.children[t.index];
		r !== e && n.insertBefore(e, r ?? null);
	}
	position(e) {
		let t = e.box;
		if (t === void 0) return;
		let n = e.record.parent === null ? void 0 : this.entries.get(e.record.parent)?.box, r = Math.round(t.x - (n?.x ?? 0)), i = Math.round(t.y - (n?.y ?? 0)), a = Math.round(t.width), o = Math.round(t.height), s = e.written;
		if (s !== void 0 && s.left === r && s.top === i && s.width === a && s.height === o) return;
		s === void 0 ? e.written = {
			left: r,
			top: i,
			width: a,
			height: o
		} : (s.left = r, s.top = i, s.width = a, s.height = o);
		let { element: c } = e;
		c.style.left = `${r}px`, c.style.top = `${i}px`, c.style.width = `${a}px`, c.style.height = `${o}px`;
	}
	remove(e) {
		let t = this.entries.get(e);
		t !== void 0 && (this.entries.delete(e), t.element.remove(), this.focusedId === e && (this.focusedId = null));
	}
	applyFocus(e) {
		this.focusedId = e;
		let t = e === null ? void 0 : this.entries.get(e);
		if (this.editing !== null && this.editing.active) {
			this.editing.describe(t?.record ?? null), this.applying = !0;
			try {
				this.editing.focus();
			} finally {
				this.applying = !1;
			}
			return;
		}
		this.editing?.describe(null), this.applying = !0;
		try {
			t === void 0 ? this.container.contains(this.doc.activeElement) && this.canvas.focus({ preventScroll: !0 }) : t.element.focus({ preventScroll: !0 });
		} finally {
			this.applying = !1;
		}
	}
	listen() {
		let e = (e) => {
			let t = this.idOf(e.target);
			t !== null && this.sink.action({
				id: t,
				action: "click"
			});
		}, t = (e) => {
			if (this.applying) return;
			let t = this.idOf(e.target);
			t !== null && t !== this.focusedId && this.sink.action({
				id: t,
				action: "focus"
			});
		}, n = (e) => this.sink.keyDown?.(e), r = (e) => this.sink.keyUp?.(e), i = (e) => {
			let t = e.clipboardData?.getData("text/plain") ?? "";
			t.length !== 0 && (e.preventDefault(), this.sink.paste?.(t));
		};
		return this.container.addEventListener("click", e), this.container.addEventListener("focusin", t), this.container.addEventListener("keydown", n), this.container.addEventListener("keyup", r), this.container.addEventListener("paste", i), () => {
			this.container.removeEventListener("click", e), this.container.removeEventListener("focusin", t), this.container.removeEventListener("keydown", n), this.container.removeEventListener("keyup", r), this.container.removeEventListener("paste", i);
		};
	}
	idOf(e) {
		return this.ids.get(e) ?? null;
	}
	trackCanvas() {
		let e = () => {
			let e = this.canvas.getBoundingClientRect();
			this.container.style.left = `${e.left}px`, this.container.style.top = `${e.top}px`, this.container.style.width = `${e.width}px`, this.container.style.height = `${e.height}px`;
		};
		e();
		let t = this.doc.defaultView;
		t !== null && (t.addEventListener("resize", e), t.addEventListener("scroll", e, !0), this.stopTracking = () => {
			t.removeEventListener("resize", e), t.removeEventListener("scroll", e, !0);
		}, typeof ResizeObserver < "u" && (this.resizeObserver = new ResizeObserver(e), this.resizeObserver.observe(this.canvas)));
	}
};
function F(e, t, n) {
	n !== void 0 && e.setAttribute(t, String(n));
}
function I(e, t) {
	e.children.length > 0 || e.textContent !== t && (e.textContent = t);
}
//#endregion
//#region packages/framework/src/storage/StorageAdapter.ts
function L(e) {
	let t = e instanceof Error ? e.name : "";
	return t === "QuotaExceededError" || t === "NS_ERROR_DOM_QUOTA_REACHED" ? "full" : t === "SecurityError" || t === "NotAllowedError" || t === "TypeError" ? "denied" : "failed";
}
function R(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region packages/framework/src/app/shellStorage.ts
var z = {
	outcome: "denied",
	value: null,
	keys: [],
	error: "This window has no localStorage."
};
function B(e, t) {
	try {
		let n = t();
		if (n == null) return z;
		switch (e.op) {
			case "read": return {
				outcome: "ok",
				value: n.getItem(e.key),
				keys: [],
				error: null
			};
			case "write": return n.setItem(e.key, e.value ?? ""), {
				outcome: "ok",
				value: null,
				keys: [],
				error: null
			};
			case "remove": return n.removeItem(e.key), {
				outcome: "ok",
				value: null,
				keys: [],
				error: null
			};
			case "keys": {
				let e = [];
				for (let t = 0; t < n.length; t++) {
					let r = n.key(t);
					r !== null && e.push(r);
				}
				return {
					outcome: "ok",
					value: null,
					keys: e,
					error: null
				};
			}
		}
	} catch (e) {
		return {
			outcome: L(e),
			value: null,
			keys: [],
			error: R(e)
		};
	}
}
//#endregion
//#region packages/framework/src/app/mediaQuery.ts
function V(e, t) {
	let n = typeof globalThis > "u" ? void 0 : globalThis;
	if (typeof n?.matchMedia != "function") return t(!1), () => {};
	let r = n.matchMedia(e);
	t(r.matches);
	let i = (e) => t(e.matches);
	if (typeof r.addEventListener == "function") return r.addEventListener("change", i), () => r.removeEventListener("change", i);
	let a = r;
	return a.addListener(i), () => a.removeListener(i);
}
//#endregion
//#region packages/framework/src/app/colorScheme.ts
function H(e) {
	return V("(prefers-color-scheme: dark)", (t) => e(t ? "dark" : "light"));
}
//#endregion
//#region packages/framework/src/app/reducedMotion.ts
function U(e) {
	return V("(prefers-reduced-motion: reduce)", e);
}
//#endregion
//#region packages/framework/src/app/shellHistory.ts
function W(e = {}, t = typeof window > "u" ? void 0 : window) {
	let n = e.mode ?? (t === void 0 ? "memory" : "path");
	return n === "memory" || t === void 0 ? new te(e.initialUrl ?? "/") : new G(t, n, e.base ?? "");
}
var te = class {
	entries;
	index = 0;
	listener = null;
	constructor(e) {
		this.entries = [e];
	}
	get url() {
		return this.entries[this.index];
	}
	push(e) {
		this.entries.length = this.index + 1, this.entries.push(e), this.index = this.entries.length - 1;
	}
	replace(e) {
		this.entries[this.index] = e;
	}
	back() {
		this.step(-1);
	}
	forward() {
		this.step(1);
	}
	onChange(e) {
		this.listener = e;
	}
	dispose() {
		this.listener = null;
	}
	step(e) {
		let t = this.index + e;
		t < 0 || t >= this.entries.length || (this.index = t, this.listener?.(this.url));
	}
}, G = class {
	host;
	mode;
	base;
	listener = null;
	onPopState;
	onHashChange;
	written = null;
	constructor(e, t, n) {
		this.host = e, this.mode = t, this.base = n, this.onPopState = () => this.report(), this.onHashChange = () => this.report(), e.addEventListener("popstate", this.onPopState), t === "hash" && e.addEventListener("hashchange", this.onHashChange);
	}
	get url() {
		let e = this.host.location;
		return this.mode === "path" ? `${e.pathname}${e.search}` : this.fromHash();
	}
	push(e) {
		this.written = e, this.host.history.pushState(null, "", this.toHref(e));
	}
	replace(e) {
		this.written = e, this.host.history.replaceState(null, "", this.toHref(e));
	}
	back() {
		this.host.history.back();
	}
	forward() {
		this.host.history.forward();
	}
	onChange(e) {
		this.listener = e;
	}
	dispose() {
		this.listener = null, this.host.removeEventListener("popstate", this.onPopState), this.host.removeEventListener("hashchange", this.onHashChange);
	}
	report() {
		let e = this.url;
		e !== this.written && (this.written = null, this.listener?.(e));
	}
	toHref(e) {
		if (this.mode === "path") return e;
		let t = this.host.location;
		return `${t.pathname}${t.search}#${this.base}${e}`;
	}
	fromHash() {
		let e = this.host.location.hash.replace(/^#/, "");
		return this.base.length === 0 ? e.length === 0 ? "/" : K(e) : e === this.base || !e.startsWith(`${this.base}/`) ? "/" : K(e.slice(this.base.length));
	}
};
function K(e) {
	return e.startsWith("/") ? e : `/${e}`;
}
//#endregion
//#region packages/framework/src/app/fullscreen.ts
function q(e, t) {
	let n = J(e);
	if (n === null) return;
	let r = n;
	if (t) {
		let t = e;
		try {
			typeof t.requestFullscreen == "function" ? t.requestFullscreen().catch(() => {}) : t.webkitRequestFullscreen?.();
		} catch {}
		return;
	}
	try {
		typeof n.exitFullscreen == "function" ? n.exitFullscreen().catch(() => {}) : r.webkitExitFullscreen?.();
	} catch {}
}
function J(e) {
	let t = e.ownerDocument ?? null;
	if (t !== null && typeof t.addEventListener == "function") return t;
	let n = globalThis.document === void 0 ? null : globalThis.document;
	return n !== null && typeof n.addEventListener == "function" ? n : null;
}
function Y(e) {
	let t = J(e);
	return t !== null && (t.fullscreenElement ?? t.webkitFullscreenElement ?? null) !== null;
}
function X(e, t) {
	let n = J(e);
	if (n === null) return () => {};
	let r = () => t(Y(e));
	return n.addEventListener("fullscreenchange", r), n.addEventListener("webkitfullscreenchange", r), () => {
		n.removeEventListener("fullscreenchange", r), n.removeEventListener("webkitfullscreenchange", r);
	};
}
function Z(e, t, n) {
	let r = (n ? e : t).getBoundingClientRect();
	return r.width > 0 && r.height > 0 ? {
		width: r.width,
		height: r.height
	} : null;
}
function Q(e) {
	if (typeof globalThis.requestAnimationFrame != "function") {
		e();
		return;
	}
	globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(e));
}
//#endregion
//#region packages/framework/src/app/worker/WorkerApp.ts
function ne(e, t) {
	if (e !== void 0) {
		e(t);
		return;
	}
	window.open(t, "_blank", "noopener,noreferrer");
}
function re(e) {
	return typeof e == "function" ? {
		endpoint: e(),
		owned: !0
	} : typeof e == "string" || e instanceof URL ? {
		endpoint: new Worker(e, { type: "module" }),
		owned: !0
	} : {
		endpoint: e,
		owned: !1
	};
}
var ie = class {
	options;
	renderWorker;
	appLogicWorker;
	devtoolsListener = null;
	consoleForwarding = !1;
	ownsAppLogicWorker = !1;
	canvas;
	host;
	resizeObserver = null;
	detachInput = null;
	proxy = null;
	mirror = null;
	audio = null;
	scrollability = {
		up: !1,
		down: !1,
		left: !1,
		right: !1
	};
	history = null;
	ready = !1;
	frameHandle = null;
	detachColorScheme = null;
	detachViewportInsets = null;
	colorSchemePreference = "auto";
	resizeInFlight = !1;
	heldResize = null;
	canvasOrigin = null;
	fullscreen = !1;
	pendingMove = null;
	moveFrame = null;
	constructor(e) {
		this.options = e, this.colorSchemePreference = e.colorScheme ?? "auto";
	}
	get appLogic() {
		return this.appLogicWorker === void 0 ? void 0 : p(this.appLogicWorker);
	}
	mount(e) {
		let t = ae(e);
		this.host = t;
		let n = document.createElement("canvas");
		if (n.style.display = "block", n.style.width = "100%", n.style.height = "100%", l(n), n.tabIndex = 0, t.appendChild(n), this.canvas = n, typeof n.transferControlToOffscreen != "function") throw Error("OffscreenCanvas is unavailable, so the render worker cannot draw. Use createSyncApp(Root).mountSync(host) for the single-thread configuration.");
		let r = n.transferControlToOffscreen(), a = this.options.renderWorker, o = typeof a == "function" ? a() : new Worker(a, { type: "module" });
		this.renderWorker = o, o.addEventListener("message", this.handleWorkerMessage), o.addEventListener("error", this.handleWorkerFailure);
		let { width: s, height: c } = ce(n, t), u = [r], d;
		if (this.options.appLogicWorker !== void 0) {
			let e = re(this.options.appLogicWorker), t = e.endpoint;
			this.appLogicWorker = t, this.ownsAppLogicWorker = e.owned, t.addEventListener("message", this.handleAppWorkerMessage), t.start?.(), this.consoleForwarding && t.postMessage({
				type: "gesso:console",
				enabled: !0
			});
			let n = new MessageChannel();
			t.postMessage({ type: "gesso:hub" }, [n.port2]), d = n.port1, u.push(n.port1);
		}
		return o.postMessage({
			type: "init",
			canvas: r,
			width: s,
			height: c,
			dpr: window.devicePixelRatio || 1,
			renderer: this.options.renderer,
			textInput: "proxy",
			accessibility: this.options.accessibility !== !1,
			appPort: d
		}, u), this.observeResize(t), this.attachHistory(), this.detachInput = this.attachInput(n), this.audio = new x({
			sample: (e) => this.post({
				type: "audioSample",
				sample: e
			}),
			action: (e) => this.post({
				type: "audioAction",
				action: e
			})
		}), this.setColorScheme(this.colorSchemePreference), this.detachViewportInsets = i((e) => this.post({
			type: "viewportInsets",
			insets: e
		})), this.proxy = new T(n, {
			beforeInput: (e, t) => this.post({
				type: "beforeInput",
				inputType: e,
				data: t
			}),
			compositionStart: () => this.post({ type: "compositionStart" }),
			compositionUpdate: (e, t) => this.post({
				type: "compositionUpdate",
				text: e,
				caret: t
			}),
			compositionEnd: (e) => this.post({
				type: "compositionEnd",
				text: e
			}),
			paste: (e) => this.post({
				type: "paste",
				text: e
			}),
			blur: () => this.post({ type: "blur" }),
			keyDown: (e) => this.forwardKeyDown(e),
			keyUp: (e) => this.forwardKeyUp(e)
		}), this.options.accessibility !== !1 && (this.mirror = new P(n, {
			action: (e) => this.post({
				type: "semanticsAction",
				action: e
			}),
			keyDown: (e) => this.forwardKeyDown(e),
			keyUp: (e) => this.forwardKeyUp(e),
			paste: (e) => this.post({
				type: "paste",
				text: e
			})
		}, this.proxy)), () => this.dispose();
	}
	handleWorkerFailure = (e) => {
		if (e.preventDefault(), this.ready) return;
		let t = e.filename === void 0 || e.filename === "" ? "" : ` (${e.filename})`;
		this.report(`the render worker failed to start: ${e.message}${t}`, void 0, "uncaught");
	};
	report(e, t, n) {
		this.devtoolsListener?.({
			kind: "error",
			message: e,
			...t === void 0 ? {} : { stack: t },
			source: n
		}), (this.options.onError ?? ((e, t, n) => console.error(`[gesso render worker: ${n}] ${e}`, t)))(e, t, n);
	}
	forwardKeyDown(e) {
		this.flushPendingMove(), this.options.interceptFind === !0 && $(e) && e.preventDefault(), (e.key === "Tab" || oe(e)) && e.preventDefault(), this.post({
			type: "keyDown",
			key: e.key,
			modifiers: v(e),
			at: _(e)
		});
	}
	forwardKeyUp(e) {
		this.flushPendingMove(), this.post({
			type: "keyUp",
			key: e.key,
			modifiers: v(e),
			at: _(e)
		});
	}
	setInspector(e) {
		this.post({
			type: "inspector",
			enabled: e
		});
	}
	onDevtools(e) {
		this.devtoolsListener = e;
	}
	devtools(e) {
		this.post({
			type: "devtools",
			request: e
		}), e.kind === "console" && (this.consoleForwarding = e.enabled, this.appLogicWorker?.postMessage({
			type: "gesso:console",
			enabled: e.enabled
		}));
	}
	setColorScheme(e) {
		if (this.detachColorScheme?.(), this.detachColorScheme = null, this.colorSchemePreference = e, this.renderWorker !== void 0) {
			if (e === "auto") {
				this.detachColorScheme = H((e) => this.post({
					type: "colorScheme",
					scheme: e
				}));
				return;
			}
			this.post({
				type: "colorScheme",
				scheme: e
			});
		}
	}
	setFrameLoop(e) {
		if (!e) {
			this.frameHandle !== null && (cancelAnimationFrame(this.frameHandle), this.frameHandle = null);
			return;
		}
		if (this.frameHandle !== null) return;
		let t = (e) => {
			this.frameHandle = requestAnimationFrame(t), this.post({
				type: "tick",
				time: e
			});
		};
		this.frameHandle = requestAnimationFrame(t);
	}
	dispose() {
		this.ready = !1, this.setFrameLoop(!1), this.detachColorScheme?.(), this.detachColorScheme = null, this.detachViewportInsets?.(), this.detachViewportInsets = null, this.proxy?.dispose(), this.proxy = null, this.mirror?.dispose(), this.mirror = null, this.history?.dispose(), this.history = null, this.detachInput?.(), this.detachInput = null, this.audio?.dispose(), this.audio = null, this.resizeObserver?.disconnect(), this.resizeObserver = null, this.resizeInFlight = !1, this.heldResize = null, this.canvasOrigin = null, this.dropPendingMove(), this.renderWorker !== void 0 && (this.renderWorker.postMessage({ type: "dispose" }), this.renderWorker.removeEventListener("message", this.handleWorkerMessage), this.renderWorker.removeEventListener("error", this.handleWorkerFailure), this.renderWorker.terminate(), this.renderWorker = void 0), this.appLogicWorker?.removeEventListener("message", this.handleAppWorkerMessage), this.ownsAppLogicWorker && this.appLogicWorker?.terminate(), this.appLogicWorker = void 0, this.ownsAppLogicWorker = !1, this.canvas !== void 0 && this.canvas.parentElement === this.host && this.host?.removeChild(this.canvas), this.canvas = void 0, this.host = void 0;
	}
	handleAppWorkerMessage = (e) => {
		f(e.data) && this.devtoolsListener?.({
			kind: "console",
			entry: {
				...e.data.entry,
				thread: "app"
			}
		});
	};
	handleWorkerMessage = (e) => {
		let t = e.data;
		if (t.type === "frame") {
			this.options.onFrame?.({
				frame: t.frame,
				durationMs: t.durationMs,
				nodes: t.nodes,
				measured: t.measured,
				relayoutRoots: t.relayoutRoots,
				at: t.at,
				inputLatencyMs: t.inputLatencyMs,
				phases: t.phases,
				renderer: t.renderer,
				gpu: t.gpu
			});
			return;
		}
		if (t.type === "error") {
			this.report(t.message, t.stack, t.source);
			return;
		}
		if (t.type === "ready") {
			this.ready = !0;
			return;
		}
		if (t.type === "frameLoop") {
			this.setFrameLoop(t.running);
			return;
		}
		if (t.type === "inspect") {
			this.options.onInspect?.(t.report);
			return;
		}
		if (t.type === "devtools") {
			this.devtoolsListener?.(t.event);
			return;
		}
		if (t.type === "cursor") {
			this.canvas !== void 0 && (this.canvas.style.cursor = t.cursor ?? "");
			return;
		}
		if (t.type === "scrollability") {
			this.scrollability = t.scrollability, this.canvas !== void 0 && (this.canvas.style.touchAction = d(t.scrollsAnything));
			return;
		}
		if (t.type === "resized") {
			this.handleResized(t);
			return;
		}
		if (t.type === "editing") {
			this.proxy?.update(t.state);
			return;
		}
		if (t.type === "clipboard") {
			E(t.text);
			return;
		}
		if (t.type === "openUrl") {
			ne(this.options.onOpenUrl, t.url);
			return;
		}
		if (t.type === "fullscreen") {
			this.canvas !== void 0 && q(this.canvas, t.enter);
			return;
		}
		if (t.type === "popup") {
			this.openPopup(t);
			return;
		}
		if (t.type === "storage") {
			this.post({
				type: "storageResult",
				id: t.id,
				result: B(t, () => globalThis.localStorage)
			});
			return;
		}
		if (t.type === "audio") {
			this.audio?.handle(t.request);
			return;
		}
		if (t.type === "semantics") {
			this.mirror?.apply(t.update);
			return;
		}
		t.type === "history" && this.applyHistory(t.action, t.url);
	};
	attachHistory() {
		let e = W(this.options.history);
		this.history = e, e.onChange((e) => this.post({
			type: "url",
			url: e
		})), this.post({
			type: "url",
			url: e.url
		});
	}
	openPopup(e) {
		let t = !1;
		try {
			let n = `popup,width=${e.width},height=${e.height}`;
			t = window.open(e.url, e.name, n) !== null;
		} catch {
			t = !1;
		}
		this.post({
			type: "popupResult",
			id: e.id,
			opened: t
		});
	}
	applyHistory(e, t) {
		let n = this.history;
		n !== null && (e === "back" ? n.back() : e === "forward" ? n.forward() : t !== void 0 && (e === "push" ? n.push(t) : n.replace(t)));
	}
	post(e) {
		h(e) && e.at === void 0 && (e.at = g()), this.renderWorker?.postMessage(e);
	}
	observeResize(e) {
		typeof ResizeObserver > "u" || (this.resizeObserver = new ResizeObserver((e) => {
			let t = e[0];
			if (t === void 0 || (this.canvasOrigin = null, this.fullscreen)) return;
			let { width: n, height: r } = t.contentRect;
			n > 0 && r > 0 && this.requestResize({
				width: n,
				height: r,
				dpr: window.devicePixelRatio || 1
			});
		}), this.resizeObserver.observe(e));
	}
	requestResize(e) {
		if (this.resizeInFlight) {
			this.heldResize = e;
			return;
		}
		this.resizeInFlight = !0, this.post({
			type: "resize",
			...e
		});
	}
	handleResized(e) {
		this.resizeInFlight = !1;
		let t = this.heldResize;
		this.heldResize = null, t !== null && (t.width !== e.width || t.height !== e.height || t.dpr !== e.dpr) && (this.resizeInFlight = !0, this.post({
			type: "resize",
			...t
		}));
	}
	wouldConsumeWheel(e) {
		return se(this.scrollability, e.deltaX, e.deltaY);
	}
	readCanvasOrigin(e) {
		let t = e.getBoundingClientRect(), n = {
			left: t.left,
			top: t.top
		};
		return this.canvasOrigin = n, n;
	}
	flushPendingMove() {
		let e = this.pendingMove;
		this.dropPendingMove(), e !== null && this.post(e);
	}
	dropPendingMove() {
		this.moveFrame !== null && (cancelAnimationFrame(this.moveFrame), this.moveFrame = null), this.pendingMove = null;
	}
	attachInput(e) {
		let n = (t, n) => {
			let r = this.canvasOrigin ?? this.readCanvasOrigin(e);
			return {
				x: t - r.left,
				y: n - r.top
			};
		}, r = !1, i = (t) => {
			this.canvasOrigin = null, this.flushPendingMove();
			let { x: i, y: a } = n(t.clientX, t.clientY);
			r = this.proxy?.active ?? !1, (this.proxy?.active ?? !1) || e.focus(), c(e, t.pointerId), this.post({
				type: "pointerDown",
				x: i,
				y: a,
				buttons: t.buttons,
				modifiers: v(t),
				pointer: s(t),
				at: _(t)
			});
		}, a = (e) => {
			(this.proxy?.active ?? !1) && e.preventDefault();
		}, o = () => {
			this.post({
				type: "visibility",
				visible: document.visibilityState !== "hidden"
			});
		}, l = X(e, (t) => {
			this.canvasOrigin = null, this.fullscreen = t, this.post({
				type: "fullscreenChanged",
				active: t
			}), Q(() => {
				this.canvasOrigin = null;
				let n = this.host === void 0 ? null : Z(e, this.host, t);
				n !== null && this.requestResize({
					...n,
					dpr: window.devicePixelRatio || 1
				});
			});
		});
		this.post({
			type: "fullscreenChanged",
			active: Y(e)
		}), o();
		let u = U((e) => {
			this.post({
				type: "reducedMotion",
				reduced: e
			});
		}), d = (e) => {
			let { x: t, y: r } = n(e.clientX, e.clientY), i = {
				type: "pointerMove",
				x: t,
				y: r,
				buttons: e.buttons,
				modifiers: v(e),
				pointer: s(e),
				at: _(e)
			};
			if (e.buttons !== 0) {
				this.flushPendingMove(), this.post(i);
				return;
			}
			this.pendingMove = i, this.moveFrame ??= requestAnimationFrame(() => {
				this.moveFrame = null, this.flushPendingMove();
			});
		}, f = (e) => {
			this.flushPendingMove();
			let { x: t, y: i } = n(e.clientX, e.clientY);
			this.post({
				type: "pointerUp",
				x: t,
				y: i,
				buttons: e.buttons,
				modifiers: v(e),
				pointer: s(e),
				at: _(e)
			}), !r && (this.proxy?.active ?? !1) && this.proxy?.raiseKeyboard();
		}, p = (e) => {
			this.flushPendingMove(), this.post({
				type: "pointerCancel",
				pointer: s(e)
			});
		}, m = (e) => {
			this.flushPendingMove(), this.wouldConsumeWheel(e) && e.preventDefault();
			let { x: r, y: i } = n(e.clientX, e.clientY);
			this.post({
				type: "wheel",
				x: r,
				y: i,
				deltaX: e.deltaX,
				deltaY: e.deltaY,
				deltaMode: e.deltaMode,
				wheelDeltaY: t(e),
				modifiers: v(e),
				at: _(e)
			});
		}, h = (e) => this.forwardKeyDown(e), g = (e) => this.forwardKeyUp(e), y = () => {
			this.canvasOrigin = null;
		};
		return e.addEventListener("mousedown", a), document.addEventListener("visibilitychange", o), e.addEventListener("pointerdown", i), e.addEventListener("pointermove", d), e.addEventListener("pointerup", f), e.addEventListener("pointercancel", p), e.addEventListener("wheel", m, { passive: !1 }), e.addEventListener("keydown", h), e.addEventListener("keyup", g), window.addEventListener("scroll", y, {
			capture: !0,
			passive: !0
		}), window.addEventListener("resize", y), () => {
			u(), l(), e.removeEventListener("mousedown", a), document.removeEventListener("visibilitychange", o), e.removeEventListener("pointerdown", i), e.removeEventListener("pointermove", d), e.removeEventListener("pointerup", f), e.removeEventListener("pointercancel", p), e.removeEventListener("wheel", m), e.removeEventListener("keydown", h), e.removeEventListener("keyup", g), window.removeEventListener("scroll", y, { capture: !0 }), window.removeEventListener("resize", y), this.dropPendingMove(), this.canvasOrigin = null;
		};
	}
};
function ae(e) {
	if (typeof e != "string") return e;
	let t = document.querySelector(e);
	if (t === null) throw Error(`Mount host '${e}' was not found.`);
	return t;
}
function oe(e) {
	return (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A");
}
function $(e) {
	return (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F");
}
function se(e, t, n) {
	return Math.abs(n) >= Math.abs(t) ? n > 0 ? e.down : n < 0 && e.up : t > 0 ? e.right : t < 0 && e.left;
}
function ce(e, t) {
	let n = e.getBoundingClientRect();
	if (n.width > 0 && n.height > 0) return {
		width: n.width,
		height: n.height
	};
	let r = typeof getComputedStyle == "function" ? getComputedStyle(t) : void 0, i = (e) => parseFloat(e ?? "0") || 0, a = t.clientWidth - i(r?.paddingLeft) - i(r?.paddingRight), o = t.clientHeight - i(r?.paddingTop) - i(r?.paddingBottom);
	return {
		width: a > 0 ? a : 600,
		height: o > 0 ? o : 600
	};
}
//#endregion
//#region packages/framework/src/app/createApp.ts
function le(e) {
	if (!ue(e)) throw Error("createApp() builds the worker configuration and was given a component. Use createSyncApp(Root) from gesso-framework for the single-thread one, or pass options: createApp({ renderWorker: () => ... }).");
	if (e?.renderWorker === void 0) throw Error("createApp() was given no render worker. Add `gesso()` from gesso-vite-plugin to the Vite config, which writes the construction, or pass one: renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }).");
	return new ie(e);
}
function ue(e) {
	return e === void 0 ? !0 : typeof e != "object" || !e || Array.isArray(e) ? !1 : !("type" in e) && !("kind" in e) && !("subscribe" in e);
}
//#endregion
//#region .probe/shell.ts
le({ renderWorker: () => new Worker(new URL(
	/* @vite-ignore */
	"/assets/w-ku-ApA_0.js",
	"" + import.meta.url
), { type: "module" }) }).mount("#app");
//#endregion
