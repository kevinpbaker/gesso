//#region packages/framework/src/Component.ts
var e = class {}, t = function(e, n) {
	return t = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(e, t) {
		e.__proto__ = t;
	} || function(e, t) {
		for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
	}, t(e, n);
};
function n(e, n) {
	if (typeof n != "function" && n !== null) throw TypeError("Class extends value " + String(n) + " is not a constructor or null");
	t(e, n);
	function r() {
		this.constructor = e;
	}
	e.prototype = n === null ? Object.create(n) : (r.prototype = n.prototype, new r());
}
function r(e) {
	var t = typeof Symbol == "function" && Symbol.iterator, n = t && e[t], r = 0;
	if (n) return n.call(e);
	if (e && typeof e.length == "number") return { next: function() {
		return e && r >= e.length && (e = void 0), {
			value: e && e[r++],
			done: !e
		};
	} };
	throw TypeError(t ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function i(e, t) {
	var n = typeof Symbol == "function" && e[Symbol.iterator];
	if (!n) return e;
	var r = n.call(e), i, a = [], o;
	try {
		for (; (t === void 0 || t-- > 0) && !(i = r.next()).done;) a.push(i.value);
	} catch (e) {
		o = { error: e };
	} finally {
		try {
			i && !i.done && (n = r.return) && n.call(r);
		} finally {
			if (o) throw o.error;
		}
	}
	return a;
}
function a(e, t, n) {
	if (n || arguments.length === 2) for (var r = 0, i = t.length, a; r < i; r++) (a || !(r in t)) && (a ||= Array.prototype.slice.call(t, 0, r), a[r] = t[r]);
	return e.concat(a || Array.prototype.slice.call(t));
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/isFunction.js
function o(e) {
	return typeof e == "function";
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/createErrorClass.js
function s(e) {
	var t = e(function(e) {
		Error.call(e), e.stack = (/* @__PURE__ */ Error()).stack;
	});
	return t.prototype = Object.create(Error.prototype), t.prototype.constructor = t, t;
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/UnsubscriptionError.js
var c = s(function(e) {
	return function(t) {
		e(this), this.message = t ? t.length + " errors occurred during unsubscription:\n" + t.map(function(e, t) {
			return t + 1 + ") " + e.toString();
		}).join("\n  ") : "", this.name = "UnsubscriptionError", this.errors = t;
	};
});
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/arrRemove.js
function l(e, t) {
	if (e) {
		var n = e.indexOf(t);
		0 <= n && e.splice(n, 1);
	}
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/Subscription.js
var u = function() {
	function e(e) {
		this.initialTeardown = e, this.closed = !1, this._parentage = null, this._finalizers = null;
	}
	return e.prototype.unsubscribe = function() {
		var e, t, n, s, l;
		if (!this.closed) {
			this.closed = !0;
			var u = this._parentage;
			if (u) {
				if (this._parentage = null, Array.isArray(u)) try {
					for (var d = r(u), f = d.next(); !f.done; f = d.next()) f.value.remove(this);
				} catch (t) {
					e = { error: t };
				} finally {
					try {
						f && !f.done && (t = d.return) && t.call(d);
					} finally {
						if (e) throw e.error;
					}
				}
				else u.remove(this);
			}
			var m = this.initialTeardown;
			if (o(m)) try {
				m();
			} catch (e) {
				l = e instanceof c ? e.errors : [e];
			}
			var h = this._finalizers;
			if (h) {
				this._finalizers = null;
				try {
					for (var g = r(h), _ = g.next(); !_.done; _ = g.next()) {
						var v = _.value;
						try {
							p(v);
						} catch (e) {
							l ??= [], e instanceof c ? l = a(a([], i(l)), i(e.errors)) : l.push(e);
						}
					}
				} catch (e) {
					n = { error: e };
				} finally {
					try {
						_ && !_.done && (s = g.return) && s.call(g);
					} finally {
						if (n) throw n.error;
					}
				}
			}
			if (l) throw new c(l);
		}
	}, e.prototype.add = function(t) {
		if (t && t !== this) {
			if (this.closed) p(t);
			else {
				if (t instanceof e) {
					if (t.closed || t._hasParent(this)) return;
					t._addParent(this);
				}
				(this._finalizers = this._finalizers ?? []).push(t);
			}
		}
	}, e.prototype._hasParent = function(e) {
		var t = this._parentage;
		return t === e || Array.isArray(t) && t.includes(e);
	}, e.prototype._addParent = function(e) {
		var t = this._parentage;
		this._parentage = Array.isArray(t) ? (t.push(e), t) : t ? [t, e] : e;
	}, e.prototype._removeParent = function(e) {
		var t = this._parentage;
		t === e ? this._parentage = null : Array.isArray(t) && l(t, e);
	}, e.prototype.remove = function(t) {
		var n = this._finalizers;
		n && l(n, t), t instanceof e && t._removeParent(this);
	}, e.EMPTY = (function() {
		var t = new e();
		return t.closed = !0, t;
	})(), e;
}(), d = u.EMPTY;
function f(e) {
	return e instanceof u || e && "closed" in e && o(e.remove) && o(e.add) && o(e.unsubscribe);
}
function p(e) {
	o(e) ? e() : e.unsubscribe();
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/config.js
var m = {
	onUnhandledError: null,
	onStoppedNotification: null,
	Promise: void 0,
	useDeprecatedSynchronousErrorHandling: !1,
	useDeprecatedNextContext: !1
}, h = {
	setTimeout: function(e, t) {
		var n = [...arguments].slice(2), r = h.delegate;
		return r?.setTimeout ? r.setTimeout.apply(r, a([e, t], i(n))) : setTimeout.apply(void 0, a([e, t], i(n)));
	},
	clearTimeout: function(e) {
		return (h.delegate?.clearTimeout || clearTimeout)(e);
	},
	delegate: void 0
};
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/reportUnhandledError.js
function g(e) {
	h.setTimeout(function() {
		var t = m.onUnhandledError;
		if (t) t(e);
		else throw e;
	});
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/noop.js
function _() {}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/NotificationFactories.js
var v = (function() {
	return x("C", void 0, void 0);
})();
function y(e) {
	return x("E", void 0, e);
}
function b(e) {
	return x("N", e, void 0);
}
function x(e, t, n) {
	return {
		kind: e,
		value: t,
		error: n
	};
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/errorContext.js
var S = null;
function C(e) {
	if (m.useDeprecatedSynchronousErrorHandling) {
		var t = !S;
		if (t && (S = {
			errorThrown: !1,
			error: null
		}), e(), t) {
			var n = S, r = n.errorThrown, i = n.error;
			if (S = null, r) throw i;
		}
	} else e();
}
function w(e) {
	m.useDeprecatedSynchronousErrorHandling && S && (S.errorThrown = !0, S.error = e);
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/Subscriber.js
var ee = function(e) {
	n(t, e);
	function t(t) {
		var n = e.call(this) || this;
		return n.isStopped = !1, t ? (n.destination = t, f(t) && t.add(n)) : n.destination = ae, n;
	}
	return t.create = function(e, t, n) {
		return new ne(e, t, n);
	}, t.prototype.next = function(e) {
		this.isStopped ? ie(b(e), this) : this._next(e);
	}, t.prototype.error = function(e) {
		this.isStopped ? ie(y(e), this) : (this.isStopped = !0, this._error(e));
	}, t.prototype.complete = function() {
		this.isStopped ? ie(v, this) : (this.isStopped = !0, this._complete());
	}, t.prototype.unsubscribe = function() {
		this.closed || (this.isStopped = !0, e.prototype.unsubscribe.call(this), this.destination = null);
	}, t.prototype._next = function(e) {
		this.destination.next(e);
	}, t.prototype._error = function(e) {
		try {
			this.destination.error(e);
		} finally {
			this.unsubscribe();
		}
	}, t.prototype._complete = function() {
		try {
			this.destination.complete();
		} finally {
			this.unsubscribe();
		}
	}, t;
}(u), T = Function.prototype.bind;
function E(e, t) {
	return T.call(e, t);
}
var te = function() {
	function e(e) {
		this.partialObserver = e;
	}
	return e.prototype.next = function(e) {
		var t = this.partialObserver;
		if (t.next) try {
			t.next(e);
		} catch (e) {
			D(e);
		}
	}, e.prototype.error = function(e) {
		var t = this.partialObserver;
		if (t.error) try {
			t.error(e);
		} catch (e) {
			D(e);
		}
		else D(e);
	}, e.prototype.complete = function() {
		var e = this.partialObserver;
		if (e.complete) try {
			e.complete();
		} catch (e) {
			D(e);
		}
	}, e;
}(), ne = function(e) {
	n(t, e);
	function t(t, n, r) {
		var i = e.call(this) || this, a;
		if (o(t) || !t) a = {
			next: t ?? void 0,
			error: n ?? void 0,
			complete: r ?? void 0
		};
		else {
			var s;
			i && m.useDeprecatedNextContext ? (s = Object.create(t), s.unsubscribe = function() {
				return i.unsubscribe();
			}, a = {
				next: t.next && E(t.next, s),
				error: t.error && E(t.error, s),
				complete: t.complete && E(t.complete, s)
			}) : a = t;
		}
		return i.destination = new te(a), i;
	}
	return t;
}(ee);
function D(e) {
	m.useDeprecatedSynchronousErrorHandling ? w(e) : g(e);
}
function re(e) {
	throw e;
}
function ie(e, t) {
	var n = m.onStoppedNotification;
	n && h.setTimeout(function() {
		return n(e, t);
	});
}
var ae = {
	closed: !0,
	next: _,
	error: re,
	complete: _
}, oe = (function() {
	return typeof Symbol == "function" && Symbol.observable || "@@observable";
})();
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/identity.js
function se(e) {
	return e;
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/pipe.js
function ce(e) {
	return e.length === 0 ? se : e.length === 1 ? e[0] : function(t) {
		return e.reduce(function(e, t) {
			return t(e);
		}, t);
	};
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/Observable.js
var le = function() {
	function e(e) {
		e && (this._subscribe = e);
	}
	return e.prototype.lift = function(t) {
		var n = new e();
		return n.source = this, n.operator = t, n;
	}, e.prototype.subscribe = function(e, t, n) {
		var r = this, i = fe(e) ? e : new ne(e, t, n);
		return C(function() {
			var e = r, t = e.operator, n = e.source;
			i.add(t ? t.call(i, n) : n ? r._subscribe(i) : r._trySubscribe(i));
		}), i;
	}, e.prototype._trySubscribe = function(e) {
		try {
			return this._subscribe(e);
		} catch (t) {
			e.error(t);
		}
	}, e.prototype.forEach = function(e, t) {
		var n = this;
		return t = ue(t), new t(function(t, r) {
			var i = new ne({
				next: function(t) {
					try {
						e(t);
					} catch (e) {
						r(e), i.unsubscribe();
					}
				},
				error: r,
				complete: t
			});
			n.subscribe(i);
		});
	}, e.prototype._subscribe = function(e) {
		return this.source?.subscribe(e);
	}, e.prototype[oe] = function() {
		return this;
	}, e.prototype.pipe = function() {
		return ce([...arguments])(this);
	}, e.prototype.toPromise = function(e) {
		var t = this;
		return e = ue(e), new e(function(e, n) {
			var r;
			t.subscribe(function(e) {
				return r = e;
			}, function(e) {
				return n(e);
			}, function() {
				return e(r);
			});
		});
	}, e.create = function(t) {
		return new e(t);
	}, e;
}();
function ue(e) {
	return e ?? m.Promise ?? Promise;
}
function de(e) {
	return e && o(e.next) && o(e.error) && o(e.complete);
}
function fe(e) {
	return e && e instanceof ee || de(e) && f(e);
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/lift.js
function pe(e) {
	return o(e?.lift);
}
function me(e) {
	return function(t) {
		if (pe(t)) return t.lift(function(t) {
			try {
				return e(t, this);
			} catch (e) {
				this.error(e);
			}
		});
		throw TypeError("Unable to lift unknown Observable type");
	};
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/operators/OperatorSubscriber.js
function he(e, t, n, r, i) {
	return new ge(e, t, n, r, i);
}
var ge = function(e) {
	n(t, e);
	function t(t, n, r, i, a, o) {
		var s = e.call(this, t) || this;
		return s.onFinalize = a, s.shouldUnsubscribe = o, s._next = n ? function(e) {
			try {
				n(e);
			} catch (e) {
				t.error(e);
			}
		} : e.prototype._next, s._error = i ? function(e) {
			try {
				i(e);
			} catch (e) {
				t.error(e);
			} finally {
				this.unsubscribe();
			}
		} : e.prototype._error, s._complete = r ? function() {
			try {
				r();
			} catch (e) {
				t.error(e);
			} finally {
				this.unsubscribe();
			}
		} : e.prototype._complete, s;
	}
	return t.prototype.unsubscribe = function() {
		var t;
		if (!this.shouldUnsubscribe || this.shouldUnsubscribe()) {
			var n = this.closed;
			e.prototype.unsubscribe.call(this), !n && ((t = this.onFinalize) == null || t.call(this));
		}
	}, t;
}(ee), _e = s(function(e) {
	return function() {
		e(this), this.name = "ObjectUnsubscribedError", this.message = "object unsubscribed";
	};
}), ve = function(e) {
	n(t, e);
	function t() {
		var t = e.call(this) || this;
		return t.closed = !1, t.currentObservers = null, t.observers = [], t.isStopped = !1, t.hasError = !1, t.thrownError = null, t;
	}
	return t.prototype.lift = function(e) {
		var t = new ye(this, this);
		return t.operator = e, t;
	}, t.prototype._throwIfClosed = function() {
		if (this.closed) throw new _e();
	}, t.prototype.next = function(e) {
		var t = this;
		C(function() {
			var n, i;
			if (t._throwIfClosed(), !t.isStopped) {
				t.currentObservers ||= Array.from(t.observers);
				try {
					for (var a = r(t.currentObservers), o = a.next(); !o.done; o = a.next()) o.value.next(e);
				} catch (e) {
					n = { error: e };
				} finally {
					try {
						o && !o.done && (i = a.return) && i.call(a);
					} finally {
						if (n) throw n.error;
					}
				}
			}
		});
	}, t.prototype.error = function(e) {
		var t = this;
		C(function() {
			if (t._throwIfClosed(), !t.isStopped) {
				t.hasError = t.isStopped = !0, t.thrownError = e;
				for (var n = t.observers; n.length;) n.shift().error(e);
			}
		});
	}, t.prototype.complete = function() {
		var e = this;
		C(function() {
			if (e._throwIfClosed(), !e.isStopped) {
				e.isStopped = !0;
				for (var t = e.observers; t.length;) t.shift().complete();
			}
		});
	}, t.prototype.unsubscribe = function() {
		this.isStopped = this.closed = !0, this.observers = this.currentObservers = null;
	}, Object.defineProperty(t.prototype, "observed", {
		get: function() {
			return this.observers?.length > 0;
		},
		enumerable: !1,
		configurable: !0
	}), t.prototype._trySubscribe = function(t) {
		return this._throwIfClosed(), e.prototype._trySubscribe.call(this, t);
	}, t.prototype._subscribe = function(e) {
		return this._throwIfClosed(), this._checkFinalizedStatuses(e), this._innerSubscribe(e);
	}, t.prototype._innerSubscribe = function(e) {
		var t = this, n = this, r = n.hasError, i = n.isStopped, a = n.observers;
		return r || i ? d : (this.currentObservers = null, a.push(e), new u(function() {
			t.currentObservers = null, l(a, e);
		}));
	}, t.prototype._checkFinalizedStatuses = function(e) {
		var t = this, n = t.hasError, r = t.thrownError, i = t.isStopped;
		n ? e.error(r) : i && e.complete();
	}, t.prototype.asObservable = function() {
		var e = new le();
		return e.source = this, e;
	}, t.create = function(e, t) {
		return new ye(e, t);
	}, t;
}(le), ye = function(e) {
	n(t, e);
	function t(t, n) {
		var r = e.call(this) || this;
		return r.destination = t, r.source = n, r;
	}
	return t.prototype.next = function(e) {
		var t, n;
		(n = (t = this.destination)?.next) == null || n.call(t, e);
	}, t.prototype.error = function(e) {
		var t, n;
		(n = (t = this.destination)?.error) == null || n.call(t, e);
	}, t.prototype.complete = function() {
		var e, t;
		(t = (e = this.destination)?.complete) == null || t.call(e);
	}, t.prototype._subscribe = function(e) {
		return this.source?.subscribe(e) ?? d;
	}, t;
}(ve), be = function(e) {
	n(t, e);
	function t(t) {
		var n = e.call(this) || this;
		return n._value = t, n;
	}
	return Object.defineProperty(t.prototype, "value", {
		get: function() {
			return this.getValue();
		},
		enumerable: !1,
		configurable: !0
	}), t.prototype._subscribe = function(t) {
		var n = e.prototype._subscribe.call(this, t);
		return !n.closed && t.next(this._value), n;
	}, t.prototype.getValue = function() {
		var e = this, t = e.hasError, n = e.thrownError, r = e._value;
		if (t) throw n;
		return this._throwIfClosed(), r;
	}, t.prototype.next = function(t) {
		e.prototype.next.call(this, this._value = t);
	}, t;
}(ve), xe = new le(function(e) {
	return e.complete();
});
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/util/isObservable.js
function Se(e) {
	return !!e && (e instanceof le || o(e.lift) && o(e.subscribe));
}
//#endregion
//#region node_modules/.pnpm/rxjs@7.8.2/node_modules/rxjs/dist/esm5/internal/operators/map.js
function Ce(e, t) {
	return me(function(n, r) {
		var i = 0;
		n.subscribe(he(r, function(n) {
			r.next(e.call(t, n, i++));
		}));
	});
}
//#endregion
//#region packages/framework/src/Input.ts
var we = class extends be {
	label;
	snapshotBy = null;
	warnedStale = !1;
	emitted = null;
	constructor(e) {
		super(e);
	}
	emit(...e) {
		let t = super.getValue();
		typeof t == "function" && t(...e), this.emitted?.next(e[0]);
	}
	get events() {
		return this.emitted === null && (this.emitted = new ve()), this.emitted.asObservable();
	}
	get value() {
		return Oe(this), Te !== null && De === null && this.snapshotBy === null && (this.snapshotBy = Te), super.getValue();
	}
	next(e) {
		this.snapshotBy !== null && !this.warnedStale && !this.observed && !Object.is(e, super.getValue()) && (this.warnedStale = !0, je(this.snapshotBy, this.label, super.getValue(), e)), super.next(e);
	}
}, Te = null;
function Ee() {
	return Te;
}
var De = null;
function Oe(e) {
	De?.add(e);
}
function ke(e, t) {
	let n = De;
	De = e;
	try {
		return t();
	} finally {
		De = n;
	}
}
function Ae(e, t) {
	let n = Te;
	Te = e;
	try {
		return t();
	} finally {
		Te = n;
	}
}
function je(e, t, n, r) {
	let i = t === void 0 ? "a cell" : `\`${t}\``, a = Me(n, r);
	console.warn(`Component '${e}' read ${i} with .value while its body ran, and nothing is following that cell. It has since changed ${a}, and whatever was built from the first value still shows it. A component body runs once: bind the cell instead (pass it, or pipe it, into the prop it feeds), or give the component a key so a new value builds a new one.`);
}
function Me(e, t) {
	if (Ne(e) && Ne(t)) {
		for (let n of /* @__PURE__ */ new Set([...Object.keys(e), ...Object.keys(t)])) {
			let r = e[n], i = t[n];
			if (!Object.is(r, i) && Pe(r) !== Pe(i)) return `at .${n}, from ${Fe(r)} to ${Fe(i)}`;
		}
		return "to an equal-looking object";
	}
	return `from ${Fe(e)} to ${Fe(t)}`;
}
function Ne(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Pe(e) {
	try {
		return JSON.stringify(e) ?? String(e);
	} catch {
		return String(e);
	}
}
function Fe(e) {
	let t;
	try {
		t = typeof e == "function" ? "a function" : JSON.stringify(e) ?? String(e);
	} catch {
		t = String(e);
	}
	return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}
var Ie = Symbol("gesso:output-target");
function Le(e) {
	return typeof e == "object" && !!e && Ie in e;
}
function Re(e) {
	return e[Ie];
}
//#endregion
//#region packages/framework/src/InternalState.ts
var ze = class extends be {
	label;
	constructor(e) {
		super(e);
	}
	get value() {
		return Oe(this), super.getValue();
	}
	set value(e) {
		this.next(e);
	}
};
function O(e, t) {
	let n = new ze(e);
	return t !== void 0 && (n.label = t), n;
}
//#endregion
//#region packages/framework/src/service/ServiceRegistry.ts
var Be = class {
	services = /* @__PURE__ */ new Map();
	register(e) {
		if (this.services.has(e)) throw Error(`Service '${e.name}' is already registered.`);
		let t = new e();
		return this.services.set(e, t), t;
	}
	adopt(e) {
		if (this.services.has(e)) return !0;
		let t = [...this.services.keys()].filter((t) => t.name === e.name);
		if (t.length === 0) return !1;
		if (t.length > 1) throw Error(`Cannot adopt a replacement for '${e.name}': ${t.length} registered services share that name.`);
		let n = t[0], r = this.services.get(n);
		return this.services.delete(n), this.services.set(e, r), !0;
	}
	get(e) {
		let t = this.services.get(e);
		if (t === void 0) {
			let t = [...this.services.keys()].map((e) => e.name ?? "?").sort().join(", "), n = [...this.services.keys()].some((t) => t.name === e.name);
			throw Error(`Service '${e.name}' is not registered. Registered services: ${t.length > 0 ? t : "(none)"}.` + (n ? " A different class of that name is registered, which usually means the module defining it was hot-replaced. Pass the replacement to reload() so the registry can adopt it." : ""));
		}
		return t;
	}
	has(e) {
		return this.services.has(e);
	}
}, Ve = 100;
function He(e, t) {
	return Ue(e, t, 0);
}
function Ue(e, t, n) {
	if (Object.is(e, t)) return !0;
	if (n > Ve || typeof e != "object" || typeof t != "object" || e === null || t === null) return !1;
	let r = Array.isArray(e);
	if (r !== Array.isArray(t)) return !1;
	if (r) {
		let r = e, i = t;
		if (r.length !== i.length) return !1;
		for (let e = 0; e < r.length; e++) if (!Ue(r[e], i[e], n + 1)) return !1;
		return !0;
	}
	if (!We(e) || !We(t)) return !1;
	let i = e, a = t, o = Object.keys(i);
	if (o.length !== Object.keys(a).length) return !1;
	for (let e of o) if (!Object.prototype.hasOwnProperty.call(a, e) || !Ue(i[e], a[e], n + 1)) return !1;
	return !0;
}
function We(e) {
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
//#endregion
//#region packages/framework/src/derive.ts
function Ge(e) {
	return e === "reference" ? Object.is : e === "structural" ? (e, t) => He(e, t) : e;
}
//#endregion
//#region packages/framework/src/computed.ts
var Ke = class extends le {
	compute;
	label;
	equal;
	changes = new ve();
	sources = /* @__PURE__ */ new Set();
	cached;
	hasValue = !1;
	upstream = null;
	subscribers = 0;
	attaching = !1;
	snapshotBy = null;
	warnedStale = !1;
	staleWatch = null;
	constructor(e, t = {}) {
		super((e) => {
			this.subscribers++, this.staleWatch?.unsubscribe(), this.staleWatch = null, this.upstream === null && this.attach(), e.next(this.cached);
			let t = this.changes.subscribe(e);
			return () => {
				t.unsubscribe(), this.subscribers--, this.subscribers === 0 && this.detach();
			};
		}), this.compute = e, this.equal = Ge(t.equal ?? "reference"), this.label = t.label;
	}
	get value() {
		Oe(this), this.upstream === null && this.recompute();
		let e = Ee();
		return e !== null && this.snapshotBy === null && (this.snapshotBy = e, this.watchForStaleRead()), this.cached;
	}
	watchForStaleRead() {
		this.staleWatch = new u();
		let e = !0;
		for (let t of this.sources) this.staleWatch.add(t.subscribe(() => {
			e || this.observed || this.recompute() && (this.warnStale(), this.staleWatch?.unsubscribe(), this.staleWatch = null);
		}));
		e = !1;
	}
	warnStale() {
		this.snapshotBy === null || this.warnedStale || (this.warnedStale = !0, console.warn(`Component '${this.snapshotBy}' read ${this.label === void 0 ? "a computed cell" : `\`${this.label}\``} with .value while its body ran, and nothing is following that cell. It has since changed, and whatever was built from the first value still shows it. A component body runs once: bind the cell instead.`));
	}
	get observed() {
		return this.subscribers > 0;
	}
	recompute() {
		let e = /* @__PURE__ */ new Set(), t = ke(e, () => this.compute(Qe));
		this.sources = e;
		let n = !this.hasValue || !this.equal(this.cached, t);
		return this.hasValue = !0, this.cached = t, n;
	}
	attach() {
		this.attaching = !0, this.recompute(), this.upstream = new u();
		for (let e of this.sources) this.upstream.add(e.subscribe(() => this.onSourceChanged()));
		this.attaching = !1;
	}
	detach() {
		this.upstream?.unsubscribe(), this.upstream = null;
	}
	onSourceChanged() {
		if (this.attaching) return;
		let e = new Set(this.sources), t = this.recompute();
		if (!et(e, this.sources)) {
			this.detach(), this.attaching = !0, this.upstream = new u();
			for (let e of this.sources) this.upstream.add(e.subscribe(() => this.onSourceChanged()));
			this.attaching = !1;
		}
		t && this.changes.next(this.cached);
	}
};
function qe(e, t = {}) {
	return new Ke(e, t);
}
var Je = /* @__PURE__ */ new WeakMap(), Ye = /* @__PURE__ */ new WeakMap();
function Xe(e) {
	let t = Ye.get(e);
	if (t === void 0) {
		let n = /* @__PURE__ */ new Set();
		ke(n, () => void e.value), t = n.has(e), Ye.set(e, t);
	}
	return t;
}
function Ze(e) {
	if ("value" in e && Xe(e)) return e;
	let t = Je.get(e);
	return t === void 0 && (t = new $e(e), Je.set(e, t)), t;
}
var Qe = (e) => Ze(e).value, $e = class extends le {
	stream;
	last;
	followers = 0;
	upstream = null;
	changes = new ve();
	constructor(e) {
		super((e) => {
			this.followers++, this.upstream === null && this.attach(), e.next(this.last);
			let t = this.changes.subscribe(e);
			return () => {
				t.unsubscribe(), this.followers--, this.followers === 0 && (this.upstream?.unsubscribe(), this.upstream = null);
			};
		}), this.stream = e;
	}
	get value() {
		return Oe(this), this.upstream === null && this.stream.subscribe((e) => {
			this.last = e;
		}).unsubscribe(), this.last;
	}
	attach() {
		this.upstream = this.stream.subscribe((e) => {
			this.last = e, this.changes.next(e);
		});
	}
};
function et(e, t) {
	if (e.size !== t.size) return !1;
	for (let n of e) if (!t.has(n)) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/animation/UiEasing.ts
var tt = (e) => e;
function nt(e, t, n, r) {
	let i = 3 * e - 3 * n + 1, a = 3 * n - 6 * e, o = 3 * e, s = 3 * t - 3 * r + 1, c = 3 * r - 6 * t, l = 3 * t, u = (e) => ((i * e + a) * e + o) * e, d = (e) => ((s * e + c) * e + l) * e, f = (e) => (3 * i * e + 2 * a) * e + o;
	return (e) => {
		if (e <= 0) return 0;
		if (e >= 1) return 1;
		let t = e;
		for (let n = 0; n < 8; n++) {
			let n = u(t) - e;
			if (Math.abs(n) < 1e-6) return d(t);
			let r = f(t);
			if (Math.abs(r) < 1e-6) break;
			t -= n / r;
		}
		let n = 0, r = 1;
		t = e;
		for (let i = 0; i < 24; i++) {
			let i = u(t);
			if (Math.abs(i - e) < 1e-6) break;
			i > e ? r = t : n = t, t = (n + r) / 2;
		}
		return d(t);
	};
}
var rt = {
	linear: tt,
	standard: nt(.2, 0, 0, 1),
	decelerate: nt(0, 0, 0, 1),
	accelerate: nt(.3, 0, 1, 1),
	emphasized: nt(.05, .7, .1, 1)
}, it = (e, t, n) => e + (t - e) * n, at = (e, t, n) => ({
	r: e.r + (t.r - e.r) * n,
	g: e.g + (t.g - e.g) * n,
	b: e.b + (t.b - e.b) * n,
	a: e.a + (t.a - e.a) * n
}), ot = (e, t, n) => ({
	x: it(e.x ?? 0, t.x ?? 0, n),
	y: it(e.y ?? 0, t.y ?? 0, n),
	translateX: it(e.translateX ?? 0, t.translateX ?? 0, n),
	translateY: it(e.translateY ?? 0, t.translateY ?? 0, n),
	scaleX: it(e.scaleX ?? 1, t.scaleX ?? 1, n),
	scaleY: it(e.scaleY ?? 1, t.scaleY ?? 1, n),
	rotation: it(e.rotation ?? 0, t.rotation ?? 0, n)
});
function st(e) {
	let t = e;
	return typeof t.r == "number" && typeof t.g == "number" && typeof t.b == "number" && typeof t.a == "number";
}
var ct = [
	"x",
	"y",
	"translateX",
	"translateY",
	"scaleX",
	"scaleY",
	"rotation"
];
function lt(e) {
	let t = e, n = 0;
	for (let e of Object.keys(t)) {
		if (!ct.includes(e) || typeof t[e] != "number") return !1;
		n++;
	}
	return n > 0;
}
function ut(e, t) {
	if (typeof e == "number" && typeof t == "number") return it;
	if (!(typeof e != "object" || !e || typeof t != "object" || !t)) {
		if (st(e) && st(t)) return at;
		if (lt(e) && lt(t)) return ot;
	}
}
//#endregion
//#region packages/core/src/animation/UiAnimation.ts
var dt = 4, ft = class {
	cell;
	stepMs;
	reducedMotionPolicy;
	delayMs;
	startedAt = 0;
	begun = !1;
	subject = new ve();
	nextDueAt = null;
	lastWritten;
	finished = !1;
	constructor(e, t, n, r = 0) {
		this.cell = e, this.stepMs = t, this.reducedMotionPolicy = n, this.delayMs = r;
	}
	get values() {
		return this.subject.asObservable();
	}
	get isFinished() {
		return this.finished;
	}
	get dueSlackMs() {
		return Math.min(this.stepMs / 2, dt);
	}
	dueAt(e) {
		return this.begun && e - this.startedAt < this.delayMs ? this.startedAt + this.delayMs : this.nextDueAt ?? e;
	}
	begin(e) {
		this.begun || (this.begun = !0, this.startedAt = e, this.onBegin());
	}
	get hasBegun() {
		return this.begun;
	}
	onBegin() {}
	advance(e) {
		if (this.finished) return;
		this.begin(e);
		let t = e - this.startedAt;
		if (t < this.delayMs) return;
		let { value: n, done: r } = this.sample(e, t - this.delayMs);
		this.scheduleNext(e), (this.lastWritten === void 0 || !this.valuesEqual(this.lastWritten, n)) && (this.lastWritten = n, this.cell.value = n, this.subject.next(n)), r && this.finish();
	}
	scheduleNext(e) {
		if (this.stepMs <= 0) {
			this.nextDueAt = e;
			return;
		}
		let t = (this.nextDueAt ?? e) + this.stepMs;
		this.nextDueAt = t > e ? t : e + this.stepMs;
	}
	snap() {
		if (this.finished) return;
		let e = this.target;
		this.lastWritten = e, this.cell.value = e, this.subject.next(e), this.finish();
	}
	cancel() {
		this.finish();
	}
	valuesEqual(e, t) {
		return Object.is(e, t);
	}
	finish() {
		this.finished = !0, this.subject.complete();
	}
}, pt = class extends ft {
	from;
	to;
	duration;
	easing;
	repeat;
	interpolate;
	constructor(e, t, n, r) {
		super(e, n.stepMs ?? 0, n.reducedMotion ?? "snap", n.delay ?? 0), this.from = e.value, this.to = t, this.duration = n.duration, this.easing = n.easing ?? rt.standard, this.repeat = n.repeat === !0, this.interpolate = r;
	}
	get isRepeating() {
		return this.repeat;
	}
	get target() {
		return this.to;
	}
	sample(e, t) {
		if (this.duration <= 0) return {
			value: this.to,
			done: !this.repeat
		};
		if (this.repeat) {
			let e = t % this.duration / this.duration;
			return {
				value: this.interpolate(this.from, this.to, this.easing(e)),
				done: !1
			};
		}
		let n = Math.min(1, Math.max(0, t / this.duration));
		return n >= 1 ? {
			value: this.to,
			done: !0
		} : {
			value: this.interpolate(this.from, this.to, this.easing(n)),
			done: !1
		};
	}
	valuesEqual(e, t) {
		return _t(e, t);
	}
}, mt = 1e3 / 240, ht = 64, gt = class extends ft {
	position;
	previousPosition;
	velocity;
	to;
	spec;
	restDelta;
	simulatedTo;
	constructor(e, t, n) {
		super(e, n.stepMs ?? 0, n.reducedMotion ?? "snap", n.delay ?? 0), this.position = e.value, this.previousPosition = this.position, this.velocity = n.velocity ?? 0, this.to = t, this.spec = n.spring, this.restDelta = n.restDelta ?? .01, this.simulatedTo = 0;
	}
	get destination() {
		return this.to;
	}
	get currentVelocity() {
		return this.velocity;
	}
	onBegin() {
		this.simulatedTo = 0;
	}
	get target() {
		return this.to;
	}
	sample(e, t) {
		let n = Math.min(t, this.simulatedTo + ht), { stiffness: r, damping: i, mass: a } = this.spec, o = mt / 1e3;
		for (; this.simulatedTo + mt <= n;) {
			this.previousPosition = this.position;
			let e = (-r * (this.position - this.to) - i * this.velocity) / a;
			this.velocity += e * o, this.position += this.velocity * o, this.simulatedTo += mt;
		}
		if (Math.abs(this.position - this.to) < this.restDelta && Math.abs(this.velocity) < this.restDelta * 10) return this.position = this.to, this.previousPosition = this.to, this.velocity = 0, {
			value: this.to,
			done: !0
		};
		let s = (n - this.simulatedTo) / mt;
		return {
			value: this.previousPosition + (this.position - this.previousPosition) * s,
			done: !1
		};
	}
};
function _t(e, t) {
	if (Object.is(e, t)) return !0;
	if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
	let n = Object.keys(e);
	if (n.length !== Object.keys(t).length) return !1;
	for (let r of n) {
		let n = e[r], i = t[r];
		if (typeof n == "number" && typeof i == "number") {
			if (Math.abs(n - i) > 1e-6) return !1;
			continue;
		}
		if (!Object.is(n, i)) return !1;
	}
	return !0;
}
function vt(e, t, n) {
	let r = ut(e.value, t);
	if (r !== void 0) return new pt(e, t, n, r);
}
//#endregion
//#region packages/core/src/environment/UiMotion.ts
var yt = {
	durations: {
		instant: 0,
		fast: 120,
		normal: 200,
		slow: 320,
		deliberate: 500
	},
	easings: rt,
	springs: {
		gentle: {
			stiffness: 120,
			damping: 20,
			mass: 1
		},
		snappy: {
			stiffness: 220,
			damping: 24,
			mass: 1
		},
		stiff: {
			stiffness: 400,
			damping: 32,
			mass: 1
		}
	}
};
//#endregion
//#region packages/core/src/animation/UiTransition.ts
function bt(e, t, n) {
	if (typeof t != "object" || !t || Array.isArray(t)) throw Error(`The 'transition' prop on node '${e}' must be an object, got ${xt(t)}.`);
	let r = /* @__PURE__ */ new Map();
	for (let [i, a] of Object.entries(t)) {
		if (!n(i)) throw Error(`The 'transition' prop on node '${e}' names '${i}', which is not a UI property. A transition names the properties it animates, so an unknown one is a typo the same way an unknown prop is.`);
		if (typeof a == "number") {
			if (!Number.isFinite(a) || a < 0) throw Error(`The 'transition' for '${i}' on node '${e}' must be a duration in ms, got ${a}.`);
			r.set(i, {
				kind: "tween",
				duration: a
			});
			continue;
		}
		if (typeof a == "object" && a && (a.kind === "tween" || a.kind === "spring")) {
			r.set(i, a);
			continue;
		}
		throw Error(`The 'transition' for '${i}' on node '${e}' must be a duration in milliseconds or a spec built by tween() or spring(), got ${xt(a)}.`);
	}
	return r;
}
function xt(e) {
	return e === null ? "null" : Array.isArray(e) ? "an array" : `a ${typeof e}`;
}
//#endregion
//#region packages/core/src/animation/AnimationDriver.ts
function St(e) {
	return e;
}
var Ct = class {
	running = /* @__PURE__ */ new Map();
	reducedMotion = !1;
	hidden = !1;
	wake = null;
	setWakeListener(e) {
		this.wake = e;
	}
	get isRunning() {
		return this.running.size > 0;
	}
	get size() {
		return this.running.size;
	}
	get isReducedMotion() {
		return this.reducedMotion;
	}
	lands(e) {
		return e === "snap" && (this.reducedMotion || this.hidden);
	}
	start(e) {
		let t = e.cell;
		if (this.running.get(t)?.cancel(), this.running.delete(t), this.lands(e.reducedMotionPolicy)) return e.snap(), e.values;
		let n = this.running.size === 0;
		return this.running.set(t, St(e)), n && this.wake?.(), e.values;
	}
	animationFor(e) {
		return this.running.get(e);
	}
	stop(e) {
		let t = this.running.get(e);
		return t !== void 0 && (this.running.delete(e), t.cancel(), !0);
	}
	stopAll() {
		let e = [...this.running.values()];
		this.running.clear();
		for (let t of e) t.cancel();
	}
	setReducedMotion(e) {
		this.reducedMotion !== e && (this.reducedMotion = e, e && this.landRunning());
	}
	setHidden(e) {
		this.hidden !== e && (this.hidden = e, e && this.landRunning());
	}
	landRunning() {
		for (let [e, t] of this.running) this.lands(t.reducedMotionPolicy) && (this.running.delete(e), t.snap());
	}
	nextTickAt(e) {
		let t;
		for (let n of this.running.values()) {
			let r = n.dueAt(e) - n.dueSlackMs;
			(t === void 0 || r < t) && (t = r);
		}
		return t;
	}
	advance(e) {
		for (let [t, n] of this.running) n.dueAt(e) - n.dueSlackMs > e || (n.advance(e), n.isFinished && this.running.get(t) === n && this.running.delete(t));
	}
}, wt = class {
	holders = /* @__PURE__ */ new Map();
	claim(e, t, n, r = () => {}) {
		let i = this.holders.get(e), a = i === void 0 || i.node === t ? null : i;
		if (this.holders.set(e, {
			node: t,
			box: null,
			yield: n,
			restore: r,
			displaced: a
		}), i === void 0 || a === null) return {
			box: i?.box ?? null,
			yieldPrevious: () => {}
		};
		let o = !1;
		return {
			box: i.box,
			yieldPrevious: () => {
				o || (o = !0, i.yield());
			}
		};
	}
	report(e, t, n) {
		let r = this.holders.get(e);
		r !== void 0 && r.node === t && (r.box = n);
	}
	release(e, t) {
		let n = this.holders.get(e);
		if (n === void 0) return;
		if (n.node !== t) {
			for (let e = n; e.displaced !== null; e = e.displaced) if (e.displaced.node === t) {
				e.displaced = e.displaced.displaced;
				break;
			}
			return;
		}
		let r = n.displaced;
		if (r === null) {
			this.holders.delete(e);
			return;
		}
		this.holders.set(e, r), r.restore();
	}
	get names() {
		return [...this.holders.keys()];
	}
	clear() {
		this.holders.clear();
	}
}, Tt = class {
	id;
	node;
	property;
	observable;
	graph;
	dirtyFlags;
	constructor(e, t, n, r, i, a) {
		this.id = e, this.node = t, this.property = n, this.observable = r, this.graph = i, this.dirtyFlags = a;
	}
	get nodeId() {
		return this.node.id;
	}
	subscription = null;
	currentValue;
	emissions = 0;
	lastEmittedAt = 0;
	connect() {
		if (this.subscription !== null) throw Error(`Binding ${this.id} is already connected.`);
		this.subscription = this.observable.subscribe({
			next: (e) => {
				this.currentValue = e, this.emissions++, this.lastEmittedAt = Et(), this.graph.updateNodeProperty(this.node, this.property, e, this.dirtyFlags);
			},
			error: (e) => {
				this.graph.handleBindingError(this, e), this.disconnect();
			}
		});
	}
	disconnect() {
		this.subscription?.unsubscribe(), this.subscription = null;
	}
	connected() {
		return this.subscription !== null;
	}
	value() {
		return this.currentValue;
	}
	emissionCount() {
		return this.emissions;
	}
	emittedAt() {
		return this.emissions === 0 ? null : this.lastEmittedAt;
	}
};
function Et() {
	return typeof performance > "u" ? Date.now() : performance.now();
}
//#endregion
//#region packages/core/src/graph/DirtyFlags.ts
var k = /* @__PURE__ */ function(e) {
	return e[e.None = 0] = "None", e[e.Content = 1] = "Content", e[e.Paint = 2] = "Paint", e[e.Layout = 4] = "Layout", e[e.SubtreeLayout = 8] = "SubtreeLayout", e[e.Children = 16] = "Children", e[e.Transform = 32] = "Transform", e[e.Properties = 64] = "Properties", e[e.Environment = 128] = "Environment", e[e.Semantics = 256] = "Semantics", e;
}({}), Dt = class {
	id;
	parentId;
	fragmentId;
	observable;
	graph;
	builder;
	subscription = null;
	constructor(e, t, n, r, i, a) {
		this.id = e, this.parentId = t, this.fragmentId = n, this.observable = r, this.graph = i, this.builder = a;
	}
	connect() {
		if (this.subscription !== null) throw Error(`Children binding ${this.id} is already connected.`);
		this.subscription = this.observable.subscribe({
			next: (e) => this.handleValue(e),
			error: (e) => {
				console.error(`Children binding ${this.id} failed (${this.parentId} → ${this.fragmentId})`, e), this.disconnect();
			}
		});
	}
	disconnect() {
		this.subscription?.unsubscribe(), this.subscription = null;
	}
	handleValue(e) {
		let t = Array.isArray(e) ? e : [e], n = this.graph.requireNode(this.fragmentId);
		this.builder.reconcileChildren(n, t);
		let r = this.graph.requireNode(this.parentId);
		this.graph.markDirty(r, k.Children);
	}
}, Ot = class {
	node;
	type;
	listener;
	dispatcher;
	constructor(e, t, n, r) {
		this.node = e, this.type = t, this.listener = n, this.dispatcher = r;
	}
	connect() {
		this.dispatcher.addEventListener(this.node, this.type, this.listener);
	}
	disconnect() {
		this.dispatcher.removeEventListener(this.node, this.type, this.listener);
	}
}, A = /* @__PURE__ */ function(e) {
	return e.Root = "root", e.Column = "column", e.Row = "row", e.Box = "box", e.Text = "text", e.EditableText = "editable-text", e.Button = "button", e.Paint = "paint", e.ScrollView = "scroll-view", e.Grid = "grid", e.Fragment = "fragment", e;
}({});
//#endregion
//#region packages/core/src/composition/UiElement.ts
function kt(e) {
	return typeof e == "object" && !!e && e.kind === "component";
}
function At(e) {
	return typeof e == "object" && !!e && !kt(e) && typeof e.subscribe == "function";
}
function jt(e) {
	return Mt(e) || At(e) || kt(e);
}
function Mt(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return Object.values(A).includes(t.type) && typeof t.props == "object" && t.props !== null && !Array.isArray(t.props) && Array.isArray(t.children);
}
//#endregion
//#region packages/core/src/composition/UiFactory.ts
function Nt(e, t = {}, n = []) {
	if (Mt(t)) throw Error(`createElement: props for '${e}' look like a UiElement. Did you forget to call the component with props before its children? Elements can only be passed as children, never as props.`);
	return {
		type: e,
		props: t,
		children: n
	};
}
//#endregion
//#region packages/core/src/input/UiInputEvent.ts
var j = /* @__PURE__ */ function(e) {
	return e.PointerDown = "pointerdown", e.PointerUp = "pointerup", e.PointerMove = "pointermove", e.PointerCancel = "pointercancel", e.PointerEnter = "pointerenter", e.PointerLeave = "pointerleave", e.Wheel = "wheel", e.KeyDown = "keydown", e.KeyUp = "keyup", e.Focus = "focus", e.Blur = "blur", e.BeforeInput = "beforeinput", e.Input = "input", e.Paste = "paste", e.Click = "click", e.LongPress = "longpress", e.DragStart = "dragstart", e.DragMove = "dragmove", e.DragEnd = "dragend", e.PanStart = "panstart", e.PanMove = "panmove", e.PanEnd = "panend", e.ContextMenu = "contextmenu", e.PinchStart = "pinchstart", e.PinchMove = "pinchmove", e.PinchEnd = "pinchend", e;
}({});
function M() {
	return {
		ctrl: !1,
		shift: !1,
		alt: !1,
		meta: !1
	};
}
var Pt = Object.freeze({
	id: 1,
	kind: "mouse"
}), Ft = class {
	type;
	target = null;
	currentTarget = null;
	propagationStoppedFlag = !1;
	immediateStoppedFlag = !1;
	defaultPreventedFlag = !1;
	constructor(e) {
		this.type = e;
	}
	stopPropagation() {
		this.propagationStoppedFlag = !0;
	}
	stopImmediatePropagation() {
		this.propagationStoppedFlag = !0, this.immediateStoppedFlag = !0;
	}
	preventDefault() {
		this.defaultPreventedFlag = !0;
	}
	get defaultPrevented() {
		return this.defaultPreventedFlag;
	}
	get propagationStopped() {
		return this.propagationStoppedFlag;
	}
	get immediateStopped() {
		return this.immediateStoppedFlag;
	}
	reset() {
		this.target = null, this.currentTarget = null, this.propagationStoppedFlag = !1, this.immediateStoppedFlag = !1, this.defaultPreventedFlag = !1;
	}
}, It = class extends Ft {
	relatedNode;
	constructor(e, t) {
		super(e), this.relatedNode = t;
	}
}, N = class extends Ft {
	x;
	y;
	buttons;
	modifiers;
	pointer;
	constructor(e, t, n, r = 0, i = M(), a = Pt) {
		super(e), this.x = t, this.y = n, this.buttons = r, this.modifiers = i, this.pointer = a;
	}
}, Lt = class extends N {
	velocityX;
	velocityY;
	constructor(e, t, n, r = 0, i = M(), a = Pt, o = 0, s = 0) {
		super(e, t, n, r, i, a), this.velocityX = o, this.velocityY = s;
	}
}, Rt = class extends Ft {
	x;
	y;
	scale;
	rotation;
	scaleDelta;
	rotationDelta;
	translateX;
	translateY;
	modifiers;
	constructor(e, t, n, r, i, a, o, s, c, l = M()) {
		super(e), this.x = t, this.y = n, this.scale = r, this.rotation = i, this.scaleDelta = a, this.rotationDelta = o, this.translateX = s, this.translateY = c, this.modifiers = l;
	}
}, zt = class extends Ft {
	key;
	modifiers;
	constructor(e, t, n = M()) {
		super(e), this.key = t, this.modifiers = n;
	}
}, Bt = class extends Ft {
	inputType;
	data;
	constructor(e, t) {
		super("beforeinput"), this.inputType = e, this.data = t;
	}
}, Vt = class extends Ft {
	text;
	constructor(e) {
		super("paste"), this.text = e;
	}
}, Ht = class extends Ft {
	value;
	selectionStart;
	selectionEnd;
	constructor(e, t, n) {
		super("input"), this.value = e, this.selectionStart = t, this.selectionEnd = n;
	}
}, Ut = /* @__PURE__ */ function(e) {
	return e[e.Pixel = 0] = "Pixel", e[e.Line = 1] = "Line", e[e.Page = 2] = "Page", e;
}({});
function Wt(e) {
	let t = e.wheelDeltaY;
	return typeof t == "number" && Number.isFinite(t) ? t : void 0;
}
var Gt = class extends Ft {
	x;
	y;
	deltaX;
	deltaY;
	modifiers;
	deltaMode;
	wheelDeltaY;
	consumedFlag = !1;
	constructor(e, t, n, r, i, a = M(), o = 0, s) {
		super(e), this.x = t, this.y = n, this.deltaX = r, this.deltaY = i, this.modifiers = a, this.deltaMode = o, this.wheelDeltaY = s;
	}
	markConsumed() {
		this.consumedFlag = !0;
	}
	get consumed() {
		return this.consumedFlag;
	}
	reset() {
		super.reset(), this.consumedFlag = !1;
	}
}, Kt = /* @__PURE__ */ function(e) {
	return e.Normal = "normal", e.Hovered = "hovered", e.Pressed = "pressed", e.Focused = "focused", e.Disabled = "disabled", e.Selected = "selected", e.Dragged = "dragged", e;
}({});
function qt(...e) {
	return new Set(e);
}
var Jt = qt("normal");
function Yt(e, t) {
	if (e.size !== t.size) return !1;
	for (let n of e) if (!t.has(n)) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/modifiers/UiModifier.ts
function Xt(e) {
	let t = {
		...e,
		key: Symbol(e.name)
	};
	return Object.assign((e, n) => ({
		kind: t,
		args: e,
		key: n
	}), { kind: t });
}
function Zt(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e.kind;
	return typeof t == "object" && !!t && typeof t.key == "symbol" && typeof t.attach == "function";
}
//#endregion
//#region packages/core/src/modifiers/interaction.ts
var Qt = Object.freeze({
	hover: !0,
	press: !0
});
Object.freeze({
	hover: !0,
	press: !1
}), Object.freeze({
	hover: !1,
	press: !0
});
var $t = Xt({
	name: "interactive",
	attach(e, t) {
		let n = !1, r = !1, i = /* @__PURE__ */ new Set([...Object.keys(t.hovered ?? {}), ...Object.keys(t.pressed ?? {})]), a = () => {
			let a = /* @__PURE__ */ new Set();
			n && a.add(Kt.Hovered), r && a.add(Kt.Pressed), a.size === 0 && a.add(Kt.Normal), en(e.get("visualState"), a) || e.set("visualState", a);
			for (let a of i) {
				let i = (r ? t.pressed?.[a] : void 0) ?? (n ? t.hovered?.[a] : void 0);
				i === void 0 ? e.clear(a) : e.set(a, i);
			}
		};
		t.hover && (e.on(j.PointerEnter, () => {
			n = !0, a();
		}), e.on(j.PointerLeave, () => {
			n = !1, r = !1, a();
		})), t.press && (e.on(j.PointerDown, () => {
			r = !0, a();
		}), e.on(j.PointerUp, () => {
			r = !1, a();
		}), e.on(j.PointerCancel, () => {
			r = !1, a();
		}));
	}
})(Qt);
function en(e, t) {
	if (e.size !== t.size) return !1;
	for (let n of t) if (!e.has(n)) return !1;
	return !0;
}
var tn = Xt({
	name: "measure",
	attach(e, t) {
		let n = e.layoutBox();
		n !== null && t.next(n), e.onLayout((e) => t.next(e));
	}
});
//#endregion
//#region packages/core/src/composition/UiComponents.ts
function nn(e = {}) {
	return Nt(A.Text, e);
}
Object.freeze([$t]);
function rn(e = {}, ...t) {
	return Nt(A.Box, e, t);
}
function an(e = {}, ...t) {
	return Nt(A.Box, e, t);
}
function on(e = {}, ...t) {
	return Nt(A.Grid, e, t);
}
function sn(e = {}, ...t) {
	return jt(e) && !ln(e) ? Nt(A.Row, {}, [e, ...t]) : Nt(A.Row, e, t);
}
function cn(e = {}, ...t) {
	return jt(e) && !ln(e) ? Nt(A.Column, {}, [e, ...t]) : Nt(A.Column, e, t);
}
function ln(e) {
	return typeof e == "object" && !!e && !Mt(e) && !At(e) && !kt(e);
}
//#endregion
//#region packages/core/src/graph/UiPropertyOverrides.ts
function un(e, t, n, r, i) {
	let a = t.overrides?.get(n);
	return a === void 0 ? e.applyResolvedProperty(t, n, !0, r, i) : (a.declared = {
		present: !0,
		value: r
	}, pn(e, t, n, a, i));
}
function dn(e, t, n, r, i) {
	let a = mn(t, n), o = a.entries.find((e) => e.source === r.source);
	return o === void 0 ? (gn(t, n, a.entries, r), a.entries.push({ ...r })) : (o.value = r.value, o.order = r.order), a.entries.sort((e, t) => e.order - t.order), pn(e, t, n, a, i);
}
function fn(e, t, n, r, i) {
	let a = t.overrides?.get(n);
	if (a === void 0) return !1;
	let o = a.entries.findIndex((e) => e.source === r);
	if (o === -1) return !1;
	a.entries.splice(o, 1);
	let s = pn(e, t, n, a, i);
	return a.entries.length === 0 && (t.overrides?.delete(n), t.overrides?.size === 0 && (t.overrides = null)), s;
}
function pn(e, t, n, r, i) {
	let a = r.entries[r.entries.length - 1];
	return a === void 0 ? e.applyResolvedProperty(t, n, r.declared.present, r.declared.value, i) : e.applyResolvedProperty(t, n, !0, a.value, i);
}
function mn(e, t) {
	e.overrides === null && (e.overrides = /* @__PURE__ */ new Map());
	let n = e.overrides.get(t);
	if (n === void 0) {
		let r = e.properties.has(t);
		n = {
			declared: {
				present: r,
				value: r ? e.properties.get(t) : void 0
			},
			entries: []
		}, e.overrides.set(t, n);
	}
	return n;
}
var hn = /* @__PURE__ */ new Set();
function gn(e, t, n, r) {
	if (n.length === 0) return;
	let i = `${e.id}:${t}`;
	hn.has(i) || (hn.add(i), console.warn(`Modifiers '${n.map((e) => e.name).join("', '")}' and '${r.name}' both write '${t}' on node '${e.id}'. The one later in the list wins.`));
}
//#endregion
//#region packages/core/src/graph/DirtyNodeSet.ts
var _n = class {
	nodes = /* @__PURE__ */ new Set();
	mark(e) {
		let t = this.nodes.size;
		return this.nodes.add(e), this.nodes.size > t;
	}
	has(e) {
		return this.nodes.has(e);
	}
	delete(e) {
		return this.nodes.delete(e);
	}
	get size() {
		return this.nodes.size;
	}
	isEmpty() {
		return this.nodes.size === 0;
	}
	take() {
		let e = [...this.nodes];
		return this.nodes.clear(), e;
	}
	drainInto(e) {
		let t = 0;
		for (let n of this.nodes) e[t++] = n;
		return e.length = t, this.nodes.clear(), t;
	}
	clear() {
		this.nodes.clear();
	}
}, vn = class {
	id;
	type;
	constructor(e, t) {
		this.id = e, this.type = t;
	}
	parent = null;
	firstChild = null;
	lastChild = null;
	childOrderVersion = 0;
	previousSibling = null;
	nextSibling = null;
	dirtyFlags = k.None;
	properties = /* @__PURE__ */ new Map();
	overrides = null;
	environment = null;
	decorations = null;
	transitions = null;
	hasChildren() {
		return this.firstChild !== null;
	}
	isDirty() {
		return this.dirtyFlags !== k.None;
	}
	getProperty(e) {
		return this.properties.get(e);
	}
	setProperty(e, t) {
		this.properties.set(e, t);
	}
}, yn = class e {
	parent;
	values;
	constructor(e, t = /* @__PURE__ */ new Map()) {
		this.parent = e, this.values = t;
	}
	set(t, n) {
		let r = new Map(this.values);
		return r.set(t.name, n), new e(this.parent, r);
	}
	delete(t) {
		let n = new Map(this.values);
		return n.delete(t.name), new e(this.parent, n);
	}
	get(e) {
		return this.values.has(e.name) ? this.values.get(e.name) : this.parent === null ? e.defaultValue : this.parent.get(e);
	}
	has(e) {
		return this.values.has(e.name) ? !0 : this.parent !== null && this.parent.has(e);
	}
	providedKeys() {
		return this.values.keys();
	}
	get providedSize() {
		return this.values.size;
	}
	getOwn(e) {
		return this.values.get(e);
	}
	providesOwn(e) {
		return this.values.has(e);
	}
}, bn = /* @__PURE__ */ new Map();
function xn(e) {
	let t = {
		name: e.name,
		defaultValue: e.defaultValue,
		compare: e.compare
	};
	return bn.set(e.name, t), t;
}
function Sn(e) {
	return bn.get(e);
}
//#endregion
//#region packages/core/src/properties/UiColor.ts
var Cn = {
	transparent: {
		r: 0,
		g: 0,
		b: 0,
		a: 0
	},
	black: {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	},
	white: {
		r: 1,
		g: 1,
		b: 1,
		a: 1
	},
	red: {
		r: 1,
		g: 0,
		b: 0,
		a: 1
	},
	green: {
		r: 0,
		g: 1,
		b: 0,
		a: 1
	},
	blue: {
		r: 0,
		g: 0,
		b: 1,
		a: 1
	}
};
function wn(e, t) {
	let n = 1e-4;
	return Math.abs(e.r - t.r) < n && Math.abs(e.g - t.g) < n && Math.abs(e.b - t.b) < n && Math.abs(e.a - t.a) < n;
}
var Tn = /* @__PURE__ */ new WeakMap(), En = /* @__PURE__ */ new WeakMap();
function Dn(e) {
	let t = Tn.get(e);
	if (t !== void 0) return t;
	let n = On(e);
	return Tn.set(e, n), n;
}
function On(e) {
	let t = Math.round(e.r * 255), n = Math.round(e.g * 255), r = Math.round(e.b * 255), i = Math.round(e.a * 255), a = [
		t,
		n,
		r,
		i
	], o = a.map((e) => e.toString(16).padStart(2, "0")).join("");
	return a.every((e) => e >> 4 == (e & 15)) ? i === 255 ? `#${o[0]}${o[2]}${o[4]}` : `#${o[0]}${o[2]}${o[4]}${o[6]}` : i === 255 ? `#${o.slice(0, 6)}` : `#${o}`;
}
function kn(e) {
	let t = En.get(e);
	if (t !== void 0) return t;
	let n = `rgba(${Math.round(e.r * 255)}, ${Math.round(e.g * 255)}, ${Math.round(e.b * 255)}, ${e.a})`;
	return En.set(e, n), n;
}
var An = {
	transparent: {
		r: 0,
		g: 0,
		b: 0,
		a: 0
	},
	black: {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	},
	white: {
		r: 1,
		g: 1,
		b: 1,
		a: 1
	},
	red: {
		r: 1,
		g: 0,
		b: 0,
		a: 1
	},
	green: {
		r: 0,
		g: .5,
		b: 0,
		a: 1
	},
	blue: {
		r: 0,
		g: 0,
		b: 1,
		a: 1
	},
	yellow: {
		r: 1,
		g: 1,
		b: 0,
		a: 1
	},
	cyan: {
		r: 0,
		g: 1,
		b: 1,
		a: 1
	},
	magenta: {
		r: 1,
		g: 0,
		b: 1,
		a: 1
	},
	orange: {
		r: 1,
		g: .65,
		b: 0,
		a: 1
	},
	gray: {
		r: .5,
		g: .5,
		b: .5,
		a: 1
	},
	grey: {
		r: .5,
		g: .5,
		b: .5,
		a: 1
	}
};
function jn(e) {
	return Math.min(Math.max(e, 0), 1);
}
function Mn(e) {
	let t = e.slice(1);
	if ((t.length === 3 || t.length === 4) && (t = t.split("").map((e) => e + e).join("")), t.length !== 6 && t.length !== 8) return;
	let n = Number.parseInt(t, 16);
	if (!Number.isFinite(n)) return;
	if (t.length === 8) {
		let e = n >> 24 & 255, t = n >> 16 & 255, r = n >> 8 & 255, i = n & 255;
		return {
			r: e / 255,
			g: t / 255,
			b: r / 255,
			a: i / 255
		};
	}
	let r = n >> 16 & 255, i = n >> 8 & 255, a = n & 255;
	return {
		r: r / 255,
		g: i / 255,
		b: a / 255,
		a: 1
	};
}
function Nn(e) {
	let t = e.indexOf("("), n = e.indexOf(")");
	if (t < 0 || n < 0) return;
	let r = e.slice(t + 1, n).split(",").map((e) => e.trim());
	if (r.length < 3) return;
	let i = [];
	for (let e = 0; e < r.length; e++) {
		let t = r[e], n = Number(t.replace("%", ""));
		if (!Number.isFinite(n)) return;
		t.includes("%") ? i.push(n / 100) : e === 3 ? i.push(n) : i.push(n / 255);
	}
	let [a, o, s, c = 1] = i;
	return {
		r: jn(a),
		g: jn(o),
		b: jn(s),
		a: jn(c)
	};
}
var Pn = {
	r: 0,
	g: 0,
	b: 0,
	a: 0
}, Fn = 256, In = /* @__PURE__ */ new Map();
function Ln(e) {
	let t = In.get(e);
	if (t !== void 0) return t === Pn ? void 0 : t;
	let n = Rn(e);
	return In.size >= Fn && In.clear(), In.set(e, n ?? Pn), n;
}
function Rn(e) {
	let t = e.trim().toLowerCase();
	if (t.length === 0) return;
	let n = An[t];
	if (n !== void 0) return n;
	if (t.startsWith("#")) return Mn(t);
	if (t.startsWith("rgb")) return Nn(t);
}
function zn(e) {
	if (e != null) {
		if (typeof e == "string") return Ln(e);
		if (typeof e == "object" && typeof e.r == "number" && typeof e.g == "number" && typeof e.b == "number" && typeof e.a == "number") return e;
	}
}
function Bn(e, t) {
	if (e === t) return !0;
	let n = zn(e), r = zn(t);
	return n === void 0 || r === void 0 ? !1 : wn(n, r);
}
//#endregion
//#region packages/core/src/environment/UiColors.ts
var Vn = {
	background: Cn.white,
	surface: {
		r: .98,
		g: .98,
		b: .98,
		a: 1
	},
	primary: {
		r: .13,
		g: .59,
		b: .95,
		a: 1
	},
	secondary: {
		r: .61,
		g: .15,
		b: .69,
		a: 1
	},
	text: Cn.black,
	textMuted: {
		r: .4,
		g: .4,
		b: .4,
		a: 1
	},
	border: {
		r: .85,
		g: .85,
		b: .85,
		a: 1
	},
	shadow: {
		r: 0,
		g: 0,
		b: 0,
		a: .2
	},
	placeholder: {
		r: .91,
		g: .91,
		b: .92,
		a: 1
	},
	controlBackground: Cn.white,
	controlBackgroundHovered: {
		r: .95,
		g: .95,
		b: .96,
		a: 1
	},
	controlBackgroundPressed: {
		r: .9,
		g: .9,
		b: .92,
		a: 1
	},
	controlBorder: {
		r: .76,
		g: .77,
		b: .79,
		a: 1
	},
	controlForeground: {
		r: .07,
		g: .09,
		b: .13,
		a: 1
	},
	controlForegroundDisabled: {
		r: .6,
		g: .62,
		b: .65,
		a: 1
	},
	controlAccent: {
		r: .13,
		g: .59,
		b: .95,
		a: 1
	},
	danger: {
		r: .86,
		g: .15,
		b: .15,
		a: 1
	},
	focusRing: {
		r: .07,
		g: .09,
		b: .13,
		a: 1
	},
	selectionBackground: {
		r: .85,
		g: .92,
		b: .99,
		a: 1
	},
	selectionForeground: {
		r: .05,
		g: .24,
		b: .44,
		a: 1
	}
};
Cn.white;
function Hn(e, t) {
	let n = e, r = t, i = Object.keys(n);
	if (i.length !== Object.keys(r).length) return !1;
	for (let e of i) {
		let t = n[e], i = r[e];
		if (t === void 0 || i === void 0) {
			if (t !== i) return !1;
			continue;
		}
		if (!wn(t, i)) return !1;
	}
	return !0;
}
//#endregion
//#region packages/core/src/properties/UiTextStyle.ts
var Un = {
	fontFamily: "sans-serif",
	fontSize: 14,
	fontWeight: "normal",
	lineHeight: 16.8,
	letterSpacing: 0,
	color: {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	},
	textAlign: "start",
	textDirection: "ltr"
}, Wn = [], Gn = /* @__PURE__ */ new WeakMap();
function Kn(e) {
	let t = Gn.get(e);
	if (t !== void 0) return t;
	let n = "", r = [];
	for (let t of e) {
		let e = n.length;
		n += t.text, n.length !== e && r.push({
			start: e,
			end: n.length,
			fontFamily: t.fontFamily,
			fontSize: t.fontSize,
			fontWeight: t.fontWeight,
			fontStyle: t.fontStyle,
			fontStretch: t.fontStretch,
			fontVariant: t.fontVariant,
			fontKerning: t.fontKerning,
			letterSpacing: t.letterSpacing,
			color: t.color,
			backgroundColor: t.backgroundColor,
			textDecoration: t.textDecoration,
			link: t.link
		});
	}
	let i = {
		text: n,
		spans: r
	};
	return Gn.set(e, i), i;
}
function qn(e) {
	let t = e.properties.get("spans");
	if (t === void 0 || t.length === 0) return;
	let n = Kn(t);
	return n.text.length === 0 ? void 0 : n;
}
function Jn(e) {
	let t = qn(e);
	if (t !== void 0) return t.text;
	let n = e.properties.get("text");
	return typeof n == "string" ? n : "";
}
function Yn(e) {
	return qn(e)?.spans ?? Wn;
}
function Xn(e, t) {
	if (e === t) return !0;
	if (e === void 0 || t === void 0 || e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (!Zn(e[n], t[n])) return !1;
	return !0;
}
function Zn(e, t) {
	return e.text === t.text && e.fontFamily === t.fontFamily && e.fontSize === t.fontSize && e.fontWeight === t.fontWeight && e.fontStyle === t.fontStyle && e.fontStretch === t.fontStretch && e.fontVariant === t.fontVariant && e.fontKerning === t.fontKerning && e.letterSpacing === t.letterSpacing && Qn(e.color, t.color) && Qn(e.backgroundColor, t.backgroundColor) && e.textDecoration === t.textDecoration && e.link === t.link;
}
function Qn(e, t) {
	return e === t ? !0 : typeof e != "object" || typeof t != "object" || e === null || t === null ? !1 : e.r === t.r && e.g === t.g && e.b === t.b && e.a === t.a;
}
function $n(e, t) {
	let n = 1e-4;
	return e.fontFamily === t.fontFamily && Math.abs(e.fontSize - t.fontSize) < n && e.fontWeight === t.fontWeight && Math.abs(e.lineHeight - t.lineHeight) < n && Math.abs(e.letterSpacing - t.letterSpacing) < n && Math.abs(e.color.r - t.color.r) < n && Math.abs(e.color.g - t.color.g) < n && Math.abs(e.color.b - t.color.b) < n && Math.abs(e.color.a - t.color.a) < n && e.textAlign === t.textAlign && e.textDirection === t.textDirection && e.fontStyle === t.fontStyle && e.fontStretch === t.fontStretch && e.fontVariant === t.fontVariant && e.fontKerning === t.fontKerning && e.textDecoration === t.textDecoration;
}
//#endregion
//#region packages/core/src/environment/UiTypography.ts
function er(e, t) {
	return typeof e == "string" && Object.prototype.hasOwnProperty.call(t, e);
}
var tr = {
	fontFamily: "sans-serif",
	fontSize: 14,
	fontWeight: "normal",
	lineHeight: 16.8,
	letterSpacing: 0,
	color: {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	},
	textAlign: "start",
	textDirection: "ltr"
};
({ ...tr }), { ...tr }, { ...tr }, { ...tr }, { ...tr };
function nr(e, t) {
	let n = e, r = t, i = Object.keys(n);
	if (i.length !== Object.keys(r).length) return !1;
	for (let e of i) {
		let t = n[e], i = r[e];
		if (t === void 0 || i === void 0) {
			if (t !== i) return !1;
			continue;
		}
		if (!$n(t, i)) return !1;
	}
	return !0;
}
//#endregion
//#region packages/core/src/environment/UiShapes.ts
function rr(e, t) {
	let n = e, r = t, i = Object.keys(n);
	if (i.length !== Object.keys(r).length) return !1;
	for (let e of i) if (n[e] !== r[e]) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/properties/UiBoxShadow.ts
function ir(e, t, n, r, i, a = !1) {
	return {
		offsetX: e,
		offsetY: t,
		blurRadius: n,
		spreadRadius: r,
		color: i,
		inset: a
	};
}
function ar(e, t) {
	let n = 1e-4;
	return e.offsetX === t.offsetX && e.offsetY === t.offsetY && e.blurRadius === t.blurRadius && e.spreadRadius === t.spreadRadius && e.inset === t.inset && Math.abs(e.color.r - t.color.r) < n && Math.abs(e.color.g - t.color.g) < n && Math.abs(e.color.b - t.color.b) < n && Math.abs(e.color.a - t.color.a) < n;
}
function or(e, t) {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (!ar(e[n], t[n])) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/environment/UiShadows.ts
function sr(e, t) {
	return or(e.none, t.none) && or(e.extraSmall, t.extraSmall) && or(e.small, t.small) && or(e.medium, t.medium) && or(e.large, t.large) && or(e.extraLarge, t.extraLarge);
}
//#endregion
//#region packages/core/src/environment/UiSpacing.ts
var cr = {
	none: 0,
	hairline: 2,
	extraSmall: 4,
	small: 8,
	medium: 12,
	large: 16,
	extraLarge: 24,
	huge: 32
}, lr = [
	"none",
	"hairline",
	"extraSmall",
	"small",
	"medium",
	"large",
	"extraLarge",
	"huge"
];
function ur(e, t) {
	for (let n of lr) if (e[n] !== t[n]) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/environment/UiThemeExtension.ts
var dr = /* @__PURE__ */ new Map(), fr = /* @__PURE__ */ new Map();
function pr(e, t) {
	if (e === t) return !0;
	let n = e, r = t, i = Object.keys(n);
	if (i.length !== Object.keys(r).length) return !1;
	for (let e of i) if (!mr(n[e], r[e])) return !1;
	return !0;
}
function mr(e, t) {
	if (Object.is(e, t)) return !0;
	if (!hr(e) || !hr(t)) return !1;
	let n = Object.keys(e);
	if (n.length !== Object.keys(t).length) return !1;
	for (let r of n) if (!Object.is(e[r], t[r])) return !1;
	return !0;
}
function hr(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function gr(e, t) {
	let n = e ?? dr, r = t ?? dr;
	if (n === r) return !0;
	if (n.size !== r.size) return !1;
	for (let [e, t] of n) {
		if (!r.has(e)) return !1;
		let n = r.get(e), i = fr.get(e);
		if (i === void 0) {
			if (!pr(t, n)) return !1;
			continue;
		}
		if (!i(t, n)) return !1;
	}
	return !0;
}
//#endregion
//#region packages/core/src/environment/UiTheme.ts
var _r = {
	colors: Vn,
	typography: {
		body: {
			fontFamily: "sans-serif",
			fontSize: 14,
			fontWeight: "normal",
			lineHeight: 16.8,
			letterSpacing: 0,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		},
		bodyLarge: {
			fontFamily: "sans-serif",
			fontSize: 16,
			fontWeight: "normal",
			lineHeight: 19.2,
			letterSpacing: 0,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		},
		bodySmall: {
			fontFamily: "sans-serif",
			fontSize: 12,
			fontWeight: "normal",
			lineHeight: 14.4,
			letterSpacing: 0,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		},
		headline: {
			fontFamily: "sans-serif",
			fontSize: 24,
			fontWeight: "bold",
			lineHeight: 28.8,
			letterSpacing: 0,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		},
		title: {
			fontFamily: "sans-serif",
			fontSize: 20,
			fontWeight: "500",
			lineHeight: 24,
			letterSpacing: 0,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		},
		label: {
			fontFamily: "sans-serif",
			fontSize: 11,
			fontWeight: "500",
			lineHeight: 13.2,
			letterSpacing: .5,
			color: {
				r: 0,
				g: 0,
				b: 0,
				a: 1
			},
			textAlign: "start",
			textDirection: "ltr"
		}
	},
	spacing: cr,
	density: "comfortable",
	contrast: "standard",
	shapes: {
		none: 0,
		extraSmall: 2,
		small: 4,
		medium: 8,
		large: 16,
		extraLarge: 24,
		full: 9999
	},
	shadows: {
		none: [],
		extraSmall: [ir(0, 1, 2, 0, {
			r: 0,
			g: 0,
			b: 0,
			a: .05
		})],
		small: [ir(0, 1, 3, 0, {
			r: 0,
			g: 0,
			b: 0,
			a: .1
		})],
		medium: [ir(0, 4, 6, -1, {
			r: 0,
			g: 0,
			b: 0,
			a: .1
		}), ir(0, 2, 4, -1, {
			r: 0,
			g: 0,
			b: 0,
			a: .06
		})],
		large: [ir(0, 10, 15, -3, {
			r: 0,
			g: 0,
			b: 0,
			a: .1
		}), ir(0, 4, 6, -2, {
			r: 0,
			g: 0,
			b: 0,
			a: .05
		})],
		extraLarge: [ir(0, 20, 25, -5, {
			r: 0,
			g: 0,
			b: 0,
			a: .1
		}), ir(0, 8, 10, -6, {
			r: 0,
			g: 0,
			b: 0,
			a: .04
		})]
	}
};
({ ..._r }), { ..._r.typography.body }, { ..._r.typography.bodyLarge }, { ..._r.typography.bodySmall }, { ..._r.typography.headline }, { ..._r.typography.title }, { ..._r.typography.label };
function vr(e, t) {
	return e.density === t.density && e.contrast === t.contrast && Hn(e.colors, t.colors) && nr(e.typography, t.typography) && rr(e.shapes, t.shapes) && sr(e.shadows, t.shadows) && ur(e.spacing, t.spacing) && gr(e.extensions, t.extensions);
}
//#endregion
//#region packages/core/src/environment/UiContainerSize.ts
var yr = {
	current: {
		width: 0,
		height: 0
	},
	changes: new be({
		width: 0,
		height: 0
	}).asObservable()
}, br = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0
};
function xr(e, t) {
	return e.top === t.top && e.right === t.right && e.bottom === t.bottom && e.left === t.left;
}
var Sr = class {
	contributions = /* @__PURE__ */ new Map();
	subject = new be(br);
	get current() {
		return this.subject.value;
	}
	get changes() {
		return this.subject.asObservable();
	}
	publish(e) {
		let t = Symbol("inset"), n = (e) => {
			e === void 0 ? this.contributions.delete(t) : this.contributions.set(t, {
				...br,
				...e
			}), this.recompute();
		};
		return n(e), n;
	}
	recompute() {
		let e = 0, t = 0, n = 0, r = 0;
		for (let i of this.contributions.values()) e = Math.max(e, i.top), t = Math.max(t, i.right), n = Math.max(n, i.bottom), r = Math.max(r, i.left);
		let i = {
			top: e,
			right: t,
			bottom: n,
			left: r
		};
		xr(this.subject.value, i) || this.subject.next(i);
	}
};
function Cr(e) {
	let t = globalThis, n = t.visualViewport;
	if (n === void 0) return e(br), () => {};
	let r = null, i = () => {
		let i = wr(t), a = Math.max(0, (t.innerHeight ?? n.height) - n.height - n.offsetTop), o = {
			top: i.top,
			right: i.right,
			bottom: Math.max(i.bottom, a),
			left: i.left
		};
		(r === null || !xr(r, o)) && (r = o, e(o));
	};
	return i(), n.addEventListener("resize", i), n.addEventListener("scroll", i), () => {
		n.removeEventListener("resize", i), n.removeEventListener("scroll", i);
	};
}
function wr(e) {
	let t = e.document?.documentElement;
	if (t === void 0 || typeof e.getComputedStyle != "function") return br;
	let n = e.getComputedStyle(t);
	return {
		top: Tr(n.getPropertyValue("--gesso-safe-area-top")),
		right: Tr(n.getPropertyValue("--gesso-safe-area-right")),
		bottom: Tr(n.getPropertyValue("--gesso-safe-area-bottom")),
		left: Tr(n.getPropertyValue("--gesso-safe-area-left"))
	};
}
function Tr(e) {
	let t = Number.parseFloat(e);
	return Number.isFinite(t) && t > 0 ? t : 0;
}
//#endregion
//#region packages/core/src/environment/UiEnvironmentKeys.ts
var P = {
	theme: xn({
		name: "theme",
		defaultValue: _r,
		compare: vr
	}),
	textStyle: xn({
		name: "textStyle",
		defaultValue: Un,
		compare: $n
	}),
	contentColor: xn({
		name: "contentColor",
		defaultValue: Cn.black,
		compare: wn
	}),
	containerSize: xn({
		name: "containerSize",
		defaultValue: yr
	}),
	insets: xn({
		name: "insets",
		defaultValue: new Sr()
	})
};
//#endregion
//#region packages/core/src/properties/UiPropertyDefinition.ts
function F(e) {
	return {
		name: e.name,
		defaultValue: e.defaultValue,
		inherited: e.inherited,
		affects: e.affects,
		compare: e.compare,
		environmentKey: e.environmentKey,
		resolveFromEnvironment: e.resolveFromEnvironment,
		validate: e.validate
	};
}
//#endregion
//#region packages/core/src/properties/UiBorderRadius.ts
var Er = { none: {
	topLeft: 0,
	topRight: 0,
	bottomRight: 0,
	bottomLeft: 0
} };
function Dr(e) {
	return {
		topLeft: e,
		topRight: e,
		bottomRight: e,
		bottomLeft: e
	};
}
function Or(e, t) {
	return e.topLeft === t.topLeft && e.topRight === t.topRight && e.bottomRight === t.bottomRight && e.bottomLeft === t.bottomLeft;
}
function kr(e) {
	return e.topLeft === 0 && e.topRight === 0 && e.bottomRight === 0 && e.bottomLeft === 0;
}
function I(e) {
	return Math.max(e.topLeft, e.topRight, e.bottomRight, e.bottomLeft);
}
function Ar(e) {
	return Math.max(0, e);
}
function jr(e) {
	if (typeof e == "number") return Dr(Ar(e));
	if (typeof e == "object" && e) {
		let t = e;
		return {
			topLeft: Ar(t.topLeft ?? 0),
			topRight: Ar(t.topRight ?? 0),
			bottomRight: Ar(t.bottomRight ?? 0),
			bottomLeft: Ar(t.bottomLeft ?? 0)
		};
	}
	return Er.none;
}
function Mr(e, t) {
	return Object.is(e, t) ? !0 : typeof e == "string" || typeof t == "string" ? !1 : Or(jr(e), jr(t));
}
//#endregion
//#region packages/core/src/layout/UiLength.ts
function Nr(e) {
	return typeof e == "object" && !!e && e.unit === "fr" && typeof e.value == "number";
}
function Pr(e) {
	return typeof e == "object" && !!e && e.unit === "minmax";
}
function Fr(e) {
	if (!Number.isFinite(e)) throw Error(`percent(): expected a finite number, got ${String(e)}.`);
	return {
		unit: "percent",
		value: e
	};
}
Object.freeze({ unit: "auto" });
function Ir(e) {
	return e === "auto" || typeof e == "object" && !!e && e.unit === "auto";
}
function Lr(e) {
	return typeof e == "object" && !!e && e.unit === "percent" && typeof e.value == "number";
}
function Rr(e, t, n, r = !1) {
	if (e != null) {
		if (typeof e == "number") {
			if (!Number.isFinite(e)) throw Error(`Property '${n}' must be a finite number, got ${String(e)}.`);
			return e;
		}
		if (Ir(e)) return r ? "auto" : void 0;
		if (Lr(e)) return t === void 0 || !Number.isFinite(t) ? void 0 : t * e.value / 100;
		throw Error(`Property '${n}' has an invalid length ${zr(e)}. Use a number of pixels, percent(n), or auto.`);
	}
}
function zr(e) {
	if (typeof e == "string") return `'${e}'`;
	try {
		return JSON.stringify(e) ?? String(e);
	} catch {
		return String(e);
	}
}
function Br(e) {
	if (e === void 0) return;
	let t = e;
	if (typeof e != "object" || !e) return `backgroundGradient: expected a gradient, got ${String(e)}. Use linearGradient() or radialGradient().`;
	if (t.kind !== "linear" && t.kind !== "radial") return `backgroundGradient: unknown gradient kind '${String(t.kind)}'. Use 'linear' or 'radial'.`;
	if (t.kind === "linear" && !Number.isFinite(t.angle)) return `backgroundGradient: a linear gradient needs a finite angle in radians, got ${String(t.angle)}.`;
	let n = t.stops;
	if (!Array.isArray(n)) return "backgroundGradient: a gradient needs a `stops` array.";
	if (n.length < 2) return `backgroundGradient: a gradient needs at least two stops, got ${n.length}.`;
	if (n.length > 8) return `backgroundGradient: ${n.length} stops exceeds the 8 a gradient may carry. The WebGPU backend stores a gradient as a fixed-size record, so the limit is a hard one; approximate the ramp with 8 stops, or stack two gradients.`;
	let r = 0;
	for (let e of n) {
		if (typeof e != "object" || !e) return `backgroundGradient: expected a stop object, got ${String(e)}.`;
		if (e.offset !== void 0 && (r++, !Vr(e.offset))) return `backgroundGradient: a stop offset must be a number of pixels or percent(n), got ${String(e.offset)}.`;
	}
	if (r !== 0 && r !== n.length) return `backgroundGradient: ${r} of ${n.length} stops carry an offset. Give every stop an offset, or none of them, in which case they spread evenly.`;
	if (t.kind === "radial") {
		let e = t;
		for (let [t, n] of [
			["centerX", e.centerX],
			["centerY", e.centerY],
			["radius", e.radius]
		]) if (n !== void 0 && !Vr(n)) return `backgroundGradient: ${t} must be a number of pixels or percent(n), got ${String(n)}.`;
	}
}
function Vr(e) {
	return typeof e == "number" && Number.isFinite(e) || Lr(e);
}
function Hr(e, t) {
	if (e === t) return !0;
	if (e === void 0 || t === void 0 || e.kind !== t.kind) return !1;
	if (e.kind === "linear" && t.kind === "linear") {
		if (e.angle !== t.angle) return !1;
	} else if (e.kind === "radial" && t.kind === "radial" && (!Ur(e.centerX, t.centerX) || !Ur(e.centerY, t.centerY) || !Ur(e.radius, t.radius))) return !1;
	if (e.stops.length !== t.stops.length) return !1;
	for (let n = 0; n < e.stops.length; n++) if (!Ur(e.stops[n].offset, t.stops[n].offset) || !Bn(e.stops[n].color, t.stops[n].color)) return !1;
	return !0;
}
function Ur(e, t) {
	return e === t ? !0 : Lr(e) && Lr(t) ? e.value === t.value : !1;
}
function Wr(e, t, n) {
	if (e.kind === "linear") {
		let r = Math.sin(e.angle), i = -Math.cos(e.angle), a = Math.abs(t * r) + Math.abs(n * i), o = t / 2, s = n / 2;
		return {
			kind: "linear",
			x0: o - r * a / 2,
			y0: s - i * a / 2,
			x1: o + r * a / 2,
			y1: s + i * a / 2,
			radius: 0,
			stops: Kr(e.stops, a)
		};
	}
	let r = Gr(e.centerX, t, t / 2), i = Gr(e.centerY, n, n / 2), a = Math.hypot(Math.max(r, t - r), Math.max(i, n - i)), o = Gr(e.radius, a, a);
	return {
		kind: "radial",
		x0: r,
		y0: i,
		x1: r,
		y1: i,
		radius: o,
		stops: Kr(e.stops, o)
	};
}
function Gr(e, t, n) {
	return e === void 0 ? n : Lr(e) ? e.value / 100 * t : e;
}
function Kr(e, t) {
	let n = [], r = e.every((e) => e.offset === void 0), i = 0;
	for (let a = 0; a < e.length; a++) {
		let o = r ? a / (e.length - 1) : qr(e[a].offset, t), s = Math.max(i, Math.min(1, Math.max(0, o)));
		i = s, n.push({
			offset: s,
			color: e[a].color
		});
	}
	return n;
}
function qr(e, t) {
	return e === void 0 ? 0 : Lr(e) ? e.value / 100 : t > 0 ? e / t : 0;
}
//#endregion
//#region packages/core/src/properties/UiTransform.ts
var Jr = { identity: {
	x: 0,
	y: 0,
	translateX: 0,
	translateY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0
} };
function Yr(e = {}) {
	return {
		x: e.x ?? 0,
		y: e.y ?? 0,
		translateX: e.translateX ?? 0,
		translateY: e.translateY ?? 0,
		scaleX: e.scaleX ?? 1,
		scaleY: e.scaleY ?? 1,
		rotation: e.rotation ?? 0
	};
}
function Xr(e) {
	return typeof e == "number" && Number.isFinite(e);
}
function Zr(e) {
	if (typeof e != "object" || !e) return;
	let t = e;
	if (t.x !== void 0 && !Xr(t.x) || t.y !== void 0 && !Xr(t.y) || t.translateX !== void 0 && !Xr(t.translateX) || t.translateY !== void 0 && !Xr(t.translateY) || t.scaleX !== void 0 && !Xr(t.scaleX) || t.scaleY !== void 0 && !Xr(t.scaleY) || t.rotation !== void 0 && !Xr(t.rotation)) return;
	let n = Yr(t);
	if (!$r(n)) return n;
}
function Qr(e, t) {
	let n = 1e-4;
	return Math.abs(e.x - t.x) < n && Math.abs(e.y - t.y) < n && Math.abs(e.translateX - t.translateX) < n && Math.abs(e.translateY - t.translateY) < n && Math.abs(e.scaleX - t.scaleX) < n && Math.abs(e.scaleY - t.scaleY) < n && Math.abs(e.rotation - t.rotation) < n;
}
function $r(e) {
	return Qr(e, Jr.identity);
}
//#endregion
//#region packages/core/src/rendering/PaintSurface.ts
function ei(e, t) {
	return e === t ? !0 : e === void 0 || t === void 0 || e.draw !== t.draw || e.intrinsicWidth !== t.intrinsicWidth || e.intrinsicHeight !== t.intrinsicHeight ? !1 : ti(e.inputs, t.inputs);
}
function ti(e, t) {
	let n = e ?? ni, r = t ?? ni;
	if (n === r) return !0;
	if (n.length !== r.length) return !1;
	for (let e = 0; e < n.length; e++) if (!Object.is(n[e], r[e])) return !1;
	return !0;
}
var ni = Object.freeze([]);
function ri(e, t) {
	return e === t ? !0 : e === void 0 || t === void 0 ? !1 : e.d === t.d && e.viewBox === t.viewBox && e.fill === t.fill && e.fillRule === t.fillRule && e.stroke === t.stroke && e.strokeWidth === t.strokeWidth && e.lineCap === t.lineCap && e.lineJoin === t.lineJoin && e.miterLimit === t.miterLimit && e.dashOffset === t.dashOffset && ti(e.dash, t.dash);
}
//#endregion
//#region packages/core/src/properties/UiPropertyValues.ts
function ii(e) {
	if (e !== void 0 && e !== "columns") return `Unknown subgrid axis '${String(e)}'. Only 'columns' is supported: a virtualized table's parent cannot see the rows that are not mounted, so its row tracks are not something a row could share.`;
}
//#endregion
//#region packages/core/src/properties/UiSemantics.ts
var ai = /* @__PURE__ */ "button.checkbox.switch.radio.radiogroup.slider.spinbutton.textbox.searchbox.combobox.listbox.option.menu.menubar.menuitem.menuitemcheckbox.menuitemradio.tab.tablist.tabpanel.link.progressbar.list.listitem.tree.treeitem.grid.row.columnheader.rowheader.cell.group.separator.toolbar.heading.image.paragraph.dialog.alertdialog.tooltip.alert.status.banner.navigation.main.region.form.search.contentinfo".split("."), oi = new Set(ai);
function si(e) {
	return typeof e == "string" && oi.has(e);
}
var ci = [
	"checked",
	"mixed",
	"expanded",
	"collapsed",
	"selected",
	"pressed",
	"busy",
	"invalid",
	"required",
	"readonly",
	"modal"
], li = new Set(ci);
function ui(e) {
	return typeof e == "string" && li.has(e);
}
function di(e) {
	return [...new Set(e)].sort();
}
function fi(e, t) {
	if (e === void 0 || t === void 0) return e === t;
	if (e.length !== t.length) return !1;
	let n = di(e), r = di(t);
	return n.every((e, t) => e === r[t]);
}
function pi(e) {
	if (e === void 0 || si(e)) return;
	let t = hi(String(e), ai);
	return `Unknown role '${String(e)}'.` + (t === void 0 ? "" : ` Did you mean '${t}'?`) + " Roles are the ARIA names listed in UI_ROLES.";
}
function mi(e) {
	if (e !== void 0) {
		if (!Array.isArray(e)) return `States must be an array of state names, got ${typeof e}.`;
		for (let t of e) if (!ui(t)) {
			let e = hi(String(t), ci);
			return `Unknown state '${String(t)}'.` + (e === void 0 ? "" : ` Did you mean '${e}'?`) + " States are the names listed in UI_SEMANTIC_STATES.";
		}
	}
}
function hi(e, t) {
	let n, r = Infinity, i = e.toLowerCase();
	for (let e of t) {
		let t = gi(i, e);
		t < r && (r = t, n = e);
	}
	return n !== void 0 && r <= Math.max(1, Math.floor(e.length / 3)) ? n : void 0;
}
function gi(e, t) {
	let n = Array.from({ length: t.length + 1 }, (e, t) => t);
	for (let r = 1; r <= e.length; r++) {
		let i = n[0];
		n[0] = r;
		for (let a = 1; a <= t.length; a++) {
			let o = Math.min(n[a] + 1, n[a - 1] + 1, i + (e[r - 1] === t[a - 1] ? 0 : 1));
			i = n[a], n[a] = o;
		}
	}
	return n[t.length];
}
//#endregion
//#region packages/core/src/properties/UiProperty.ts
var L = k.Layout, R = k.Paint, _i = k.Content, vi = k.Transform, yi = k.Environment, z = k.Semantics, B = {
	width: F({
		name: "width",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	height: F({
		name: "height",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	minWidth: F({
		name: "minWidth",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	maxWidth: F({
		name: "maxWidth",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	minHeight: F({
		name: "minHeight",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	maxHeight: F({
		name: "maxHeight",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	padding: F({
		name: "padding",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingX: F({
		name: "paddingX",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingY: F({
		name: "paddingY",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingTop: F({
		name: "paddingTop",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingRight: F({
		name: "paddingRight",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingBottom: F({
		name: "paddingBottom",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingLeft: F({
		name: "paddingLeft",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingStart: F({
		name: "paddingStart",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	paddingEnd: F({
		name: "paddingEnd",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	margin: F({
		name: "margin",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginX: F({
		name: "marginX",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginY: F({
		name: "marginY",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginTop: F({
		name: "marginTop",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginRight: F({
		name: "marginRight",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginBottom: F({
		name: "marginBottom",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginLeft: F({
		name: "marginLeft",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginStart: F({
		name: "marginStart",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	marginEnd: F({
		name: "marginEnd",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	gap: F({
		name: "gap",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	rowGap: F({
		name: "rowGap",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	columnGap: F({
		name: "columnGap",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	flex: F({
		name: "flex",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	flexWrap: F({
		name: "flexWrap",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	alignContent: F({
		name: "alignContent",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	columns: F({
		name: "columns",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	rows: F({
		name: "rows",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	autoColumns: F({
		name: "autoColumns",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	autoRows: F({
		name: "autoRows",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	subgrid: F({
		name: "subgrid",
		defaultValue: void 0,
		inherited: !1,
		affects: L,
		validate: ii
	}),
	autoFlow: F({
		name: "autoFlow",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	justifyContent: F({
		name: "justifyContent",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	column: F({
		name: "column",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	columnSpan: F({
		name: "columnSpan",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	row: F({
		name: "row",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	rowSpan: F({
		name: "rowSpan",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	layout: F({
		name: "layout",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	layoutData: F({
		name: "layoutData",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	aspectRatio: F({
		name: "aspectRatio",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	flexGrow: F({
		name: "flexGrow",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	flexShrink: F({
		name: "flexShrink",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	flexBasis: F({
		name: "flexBasis",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	x: F({
		name: "x",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	y: F({
		name: "y",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	selfX: F({
		name: "selfX",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	selfY: F({
		name: "selfY",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	position: F({
		name: "position",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	top: F({
		name: "top",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	right: F({
		name: "right",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	bottom: F({
		name: "bottom",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	left: F({
		name: "left",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	zIndex: F({
		name: "zIndex",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	lift: F({
		name: "lift",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	liftBoundary: F({
		name: "liftBoundary",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	anchor: F({
		name: "anchor",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	placement: F({
		name: "placement",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	anchorOffset: F({
		name: "anchorOffset",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	direction: F({
		name: "direction",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	overflow: F({
		name: "overflow",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R
	}),
	inset: F({
		name: "inset",
		defaultValue: void 0,
		inherited: !1,
		affects: L
	}),
	backgroundColor: F({
		name: "backgroundColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	backgroundGradient: F({
		name: "backgroundGradient",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Hr,
		validate: Br
	}),
	color: F({
		name: "color",
		defaultValue: Cn.black,
		inherited: !0,
		affects: R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.color,
		compare: Bn
	}),
	borderColor: F({
		name: "borderColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	borderWidth: F({
		name: "borderWidth",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	borderRadius: F({
		name: "borderRadius",
		defaultValue: Er.none,
		inherited: !1,
		affects: R,
		compare: Mr
	}),
	opacity: F({
		name: "opacity",
		defaultValue: 1,
		inherited: !1,
		affects: R
	}),
	boxShadows: F({
		name: "boxShadows",
		defaultValue: [],
		inherited: !1,
		affects: R,
		compare: or
	}),
	visible: F({
		name: "visible",
		defaultValue: !0,
		inherited: !1,
		affects: R | z
	}),
	fontFamily: F({
		name: "fontFamily",
		defaultValue: Un.fontFamily,
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontFamily
	}),
	fontSize: F({
		name: "fontSize",
		defaultValue: Un.fontSize,
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontSize
	}),
	fontWeight: F({
		name: "fontWeight",
		defaultValue: Un.fontWeight,
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontWeight
	}),
	lineHeight: F({
		name: "lineHeight",
		defaultValue: Un.lineHeight,
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.lineHeight
	}),
	letterSpacing: F({
		name: "letterSpacing",
		defaultValue: Un.letterSpacing,
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.letterSpacing
	}),
	textAlign: F({
		name: "textAlign",
		defaultValue: Un.textAlign,
		inherited: !0,
		affects: R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.textAlign
	}),
	textDirection: F({
		name: "textDirection",
		defaultValue: Un.textDirection,
		inherited: !0,
		affects: R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.textDirection
	}),
	fontStyle: F({
		name: "fontStyle",
		defaultValue: "normal",
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontStyle ?? "normal"
	}),
	fontStretch: F({
		name: "fontStretch",
		defaultValue: "normal",
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontStretch ?? "normal"
	}),
	fontVariant: F({
		name: "fontVariant",
		defaultValue: "normal",
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontVariant ?? "normal"
	}),
	fontKerning: F({
		name: "fontKerning",
		defaultValue: "auto",
		inherited: !0,
		affects: L | R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.fontKerning ?? "auto"
	}),
	textDecoration: F({
		name: "textDecoration",
		defaultValue: "none",
		inherited: !0,
		affects: R,
		environmentKey: P.textStyle,
		resolveFromEnvironment: (e) => e.textDecoration ?? "none"
	}),
	spans: F({
		name: "spans",
		defaultValue: void 0,
		inherited: !1,
		affects: _i | L | z,
		compare: Xn
	}),
	verticalAlign: F({
		name: "verticalAlign",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	textWrap: F({
		name: "textWrap",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R
	}),
	maxLines: F({
		name: "maxLines",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R
	}),
	textOverflow: F({
		name: "textOverflow",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R
	}),
	value: F({
		name: "value",
		defaultValue: void 0,
		inherited: !1,
		affects: _i | L | z
	}),
	placeholder: F({
		name: "placeholder",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R
	}),
	multiline: F({
		name: "multiline",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	readOnly: F({
		name: "readOnly",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	caretColor: F({
		name: "caretColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	selectionColor: F({
		name: "selectionColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	matchColor: F({
		name: "matchColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	placeholderColor: F({
		name: "placeholderColor",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: Bn
	}),
	editor: F({
		name: "editor",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	cursor: F({
		name: "cursor",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	selectable: F({
		name: "selectable",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	pointerEvents: F({
		name: "pointerEvents",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	focusable: F({
		name: "focusable",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	disabled: F({
		name: "disabled",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties | z
	}),
	role: F({
		name: "role",
		defaultValue: void 0,
		inherited: !1,
		affects: z,
		validate: pi
	}),
	label: F({
		name: "label",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	description: F({
		name: "description",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	live: F({
		name: "live",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	states: F({
		name: "states",
		defaultValue: void 0,
		inherited: !1,
		affects: z,
		compare: fi,
		validate: mi
	}),
	valueNow: F({
		name: "valueNow",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	valueMin: F({
		name: "valueMin",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	valueMax: F({
		name: "valueMax",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	valueText: F({
		name: "valueText",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	posInSet: F({
		name: "posInSet",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	setSize: F({
		name: "setSize",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	level: F({
		name: "level",
		defaultValue: void 0,
		inherited: !1,
		affects: z
	}),
	transform: F({
		name: "transform",
		defaultValue: void 0,
		inherited: !1,
		affects: R | vi,
		compare: (e, t) => e === void 0 && t === void 0 ? !0 : e === void 0 || t === void 0 ? !1 : Qr(Yr(e), Yr(t))
	}),
	text: F({
		name: "text",
		defaultValue: void 0,
		inherited: !1,
		affects: _i | L | z
	}),
	image: F({
		name: "image",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	video: F({
		name: "video",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	objectFit: F({
		name: "objectFit",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	scrollX: F({
		name: "scrollX",
		defaultValue: void 0,
		inherited: !1,
		affects: vi
	}),
	scrollBehavior: F({
		name: "scrollBehavior",
		defaultValue: void 0,
		inherited: !1,
		affects: k.None
	}),
	scrollY: F({
		name: "scrollY",
		defaultValue: void 0,
		inherited: !1,
		affects: vi
	}),
	overscrollBehavior: F({
		name: "overscrollBehavior",
		defaultValue: void 0,
		inherited: !1,
		affects: k.None
	}),
	hitTestable: F({
		name: "hitTestable",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	virtualIndex: F({
		name: "virtualIndex",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	virtualLead: F({
		name: "virtualLead",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	virtualWindow: F({
		name: "virtualWindow",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	virtualSheet: F({
		name: "virtualSheet",
		defaultValue: void 0,
		inherited: !1,
		affects: k.Properties
	}),
	theme: F({
		name: "theme",
		defaultValue: void 0,
		inherited: !1,
		affects: yi
	}),
	textStyle: F({
		name: "textStyle",
		defaultValue: void 0,
		inherited: !1,
		affects: yi
	}),
	contentColor: F({
		name: "contentColor",
		defaultValue: void 0,
		inherited: !1,
		affects: yi
	}),
	containerSize: F({
		name: "containerSize",
		defaultValue: void 0,
		inherited: !1,
		affects: yi
	}),
	insets: F({
		name: "insets",
		defaultValue: void 0,
		inherited: !1,
		affects: yi
	}),
	visualState: F({
		name: "visualState",
		defaultValue: Jt,
		inherited: !1,
		affects: R,
		compare: Yt
	}),
	paint: F({
		name: "paint",
		defaultValue: void 0,
		inherited: !1,
		affects: L | R,
		compare: ei
	}),
	path: F({
		name: "path",
		defaultValue: void 0,
		inherited: !1,
		affects: R,
		compare: ri
	}),
	clipPath: F({
		name: "clipPath",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	}),
	blur: F({
		name: "blur",
		defaultValue: void 0,
		inherited: !1,
		affects: R
	})
}, bi = /* @__PURE__ */ new Map();
for (let e of Object.values(B)) bi.set(e.name, e);
function xi(e) {
	return bi.get(e);
}
function Si() {
	return Array.from(bi.keys());
}
function Ci(e) {
	let t = xi(e);
	return t === void 0 ? k.Properties : t.affects;
}
function wi(e, t = bi.keys()) {
	let n, r = Infinity, i = e.toLowerCase();
	for (let e of t) {
		let t = Ti(i, e.toLowerCase());
		t < r && (r = t, n = e);
	}
	return n !== void 0 && r <= Math.max(1, Math.floor(e.length / 3)) ? n : void 0;
}
function Ti(e, t) {
	let n = [];
	for (let r = 0; r <= e.length; r++) n.push(Array.from({ length: t.length + 1 }, () => 0)), n[r][0] = r;
	for (let e = 0; e <= t.length; e++) n[0][e] = e;
	for (let r = 1; r <= e.length; r++) for (let i = 1; i <= t.length; i++) {
		let a = e[r - 1] === t[i - 1] ? 0 : 1, o = Math.min(n[r - 1][i] + 1, n[r][i - 1] + 1, n[r - 1][i - 1] + a);
		r > 1 && i > 1 && e[r - 1] === t[i - 2] && e[r - 2] === t[i - 1] && (o = Math.min(o, n[r - 2][i - 2] + 1)), n[r][i] = o;
	}
	return n[e.length][t.length];
}
var Ei = (() => {
	let e = k.None;
	for (let t of bi.values()) t.inherited && (e |= t.affects);
	return e === k.None ? k.Paint : e;
})(), Di = class {
	constructor() {
		this.root = new vn("root", A.Root), this.root.environment = new yn(null), this.nodes.set(this.root.id, this.root);
	}
	nodes = /* @__PURE__ */ new Map();
	dirtyNodes = new _n();
	dirtyListener = null;
	nodeRemovedListener = null;
	environmentChangedListener = null;
	root;
	bindings = /* @__PURE__ */ new Map();
	nodeBindings = /* @__PURE__ */ new Map();
	childrenBindings = /* @__PURE__ */ new Map();
	eventBindings = /* @__PURE__ */ new Map();
	nextBindingId = 0;
	environmentDirty = !1;
	suppressDirtyListener = !1;
	getNode(e) {
		return this.nodes.get(e);
	}
	requireNode(e) {
		let t = this.nodes.get(e);
		if (!t) throw Error(`UI node '${e}' does not exist.`);
		return t;
	}
	hasNode(e) {
		return this.nodes.has(e);
	}
	get size() {
		return this.nodes.size;
	}
	createNode(e, t) {
		if (this.nodes.has(e)) throw Error(`UI node '${e}' already exists.`);
		let n = new vn(e, t);
		return this.nodes.set(e, n), n;
	}
	appendChild(e, t) {
		if (t.parent !== null) throw Error(`Node '${t.id}' already has a parent.`);
		if (t.parent = e, e.childOrderVersion++, e.lastChild === null) {
			e.firstChild = t, e.lastChild = t, this.inheritEnvironment(t);
			return;
		}
		let n = e.lastChild;
		n.nextSibling = t, t.previousSibling = n, e.lastChild = t, this.inheritEnvironment(t);
	}
	insertBefore(e, t, n) {
		if (t.parent !== null) throw Error(`Node '${t.id}' already has a parent.`);
		if (n !== null && n.parent !== e) throw Error(`Reference node '${n.id}' is not a child of '${e.id}'.`);
		if (n === null) {
			this.appendChild(e, t);
			return;
		}
		e.childOrderVersion++;
		let r = n.previousSibling;
		r === null ? e.firstChild = t : r.nextSibling = t, t.parent = e, t.previousSibling = r, t.nextSibling = n, n.previousSibling = t, this.inheritEnvironment(t);
	}
	removeNode(e) {
		let t = e.parent, n = [e];
		for (; n.length > 0;) {
			let e = n.pop();
			this.unbindNode(e), this.unbindChildren(e), this.unbindEvents(e), this.detachNode(e), this.nodes.delete(e.id), this.dirtyNodes.delete(e);
			for (let t = e.firstChild; t !== null; t = t.nextSibling) n.push(t);
		}
		t !== null && this.markDirty(t, k.Children), this.nodeRemovedListener?.(e);
	}
	detachNode(e) {
		let t = e.parent;
		if (!t) return;
		t.childOrderVersion++;
		let n = e.previousSibling, r = e.nextSibling;
		n ? n.nextSibling = r : t.firstChild = r, r ? r.previousSibling = n : t.lastChild = n, e.parent = null, e.previousSibling = null, e.nextSibling = null;
	}
	getBindingForProperty(e, t) {
		return this.nodeBindings.get(e)?.get(t);
	}
	bind(e, t, n, r) {
		if (this.nodes.get(e.id) !== e) throw Error(`Cannot bind to node '${e.id}' because it does not belong to this graph.`);
		let i = this.nodeBindings.get(e);
		if (i !== void 0 && i.has(t)) throw Error(`Property '${t}' on node '${e.id}' is already bound.`);
		let a = this.nextBindingId++, o = new Tt(a, e, t, n, this, r);
		return this.bindings.set(a, o), i === void 0 && (i = /* @__PURE__ */ new Map(), this.nodeBindings.set(e, i)), i.set(t, o), o.connect(), o;
	}
	unbind(e) {
		if (this.bindings.get(e.id) !== e) return;
		e.disconnect(), this.bindings.delete(e.id);
		let t = this.nodeBindings.get(e.node);
		t !== void 0 && t.get(e.property) === e && (t.delete(e.property), t.size === 0 && this.nodeBindings.delete(e.node));
	}
	unbindNode(e) {
		let t = this.nodeBindings.get(e);
		if (t !== void 0) {
			this.nodeBindings.delete(e);
			for (let e of t.values()) e.disconnect(), this.bindings.delete(e.id);
		}
	}
	handleBindingError(e, t) {
		console.error(`UI binding ${e.id} failed (${e.nodeId}.${e.property})`, t), this.unbind(e);
	}
	handleModifierError(e, t, n, r) {
		console.error(`UI modifier '${e}' threw in ${n} on node '${t.id}'`, r);
	}
	getBindingsForNode(e) {
		let t = this.nodeBindings.get(e);
		return t === void 0 ? [] : [...t.values()];
	}
	subscriptionsForNode(e) {
		return (this.nodeBindings.get(e)?.size ?? 0) + +!!this.childrenBindings.has(e) + (this.eventBindings.get(e)?.size ?? 0);
	}
	get subscriptionCount() {
		let e = this.bindings.size + this.childrenBindings.size;
		for (let t of this.eventBindings.values()) e += t.size;
		return e;
	}
	getChildrenBindingForNode(e) {
		return this.childrenBindings.get(e);
	}
	bindChildren(e, t) {
		if (this.nodes.get(e.id) !== e) throw Error(`Cannot bind children to node '${e.id}' because it does not belong to this graph.`);
		this.childrenBindings.set(e, t), t.connect();
	}
	unbindChildren(e) {
		let t = this.childrenBindings.get(e);
		t !== void 0 && (t.disconnect(), this.childrenBindings.delete(e));
	}
	getEventBindingsForNode(e) {
		let t = this.eventBindings.get(e);
		return t === void 0 ? [] : [...t.values()];
	}
	getEventBindingForType(e, t) {
		return this.eventBindings.get(e)?.get(t);
	}
	bindEvent(e, t) {
		if (this.nodes.get(e.id) !== e) throw Error(`Cannot bind events to node '${e.id}' because it does not belong to this graph.`);
		let n = this.eventBindings.get(e);
		n === void 0 && (n = /* @__PURE__ */ new Map(), this.eventBindings.set(e, n));
		let r = n.get(t.type);
		r !== void 0 && r.disconnect(), n.set(t.type, t), t.connect();
	}
	unbindEvent(e, t) {
		let n = this.eventBindings.get(e);
		n !== void 0 && n.get(t.type) === t && (t.disconnect(), n.delete(t.type), n.size === 0 && this.eventBindings.delete(e));
	}
	unbindEvents(e) {
		let t = this.eventBindings.get(e);
		if (t !== void 0) {
			this.eventBindings.delete(e);
			for (let e of t.values()) e.disconnect();
		}
	}
	markDirty(e, t) {
		let n = this.dirtyNodes.mark(e);
		e.dirtyFlags |= t, (t & k.Environment) !== 0 && (this.environmentDirty = !0), n && !this.suppressDirtyListener && this.dirtyListener?.();
	}
	hasEnvironmentDirty() {
		return this.environmentDirty;
	}
	markDirtyById(e, t) {
		let n = this.requireNode(e);
		this.markDirty(n, t);
	}
	clearDirty(e) {
		e.dirtyFlags = k.None, this.dirtyNodes.delete(e);
	}
	setDirtyListener(e) {
		this.dirtyListener = e;
	}
	setNodeRemovedListener(e) {
		this.nodeRemovedListener = e;
	}
	setEnvironmentChangedListener(e) {
		this.environmentChangedListener = e;
	}
	getDirtyNodes() {
		return this.dirtyNodes;
	}
	updateProperty(e, t, n, r = k.Properties) {
		return this.updateNodeProperty(this.requireNode(e), t, n, r);
	}
	updateNodeProperty(e, t, n, r = k.Properties) {
		return e.transitions !== null && e.transitions.write(t, n, r) ? !0 : this.updateNodePropertyNow(e, t, n, r);
	}
	updateNodePropertyNow(e, t, n, r = k.Properties) {
		return e.overrides === null ? this.applyResolvedProperty(e, t, !0, n, r) : un(this, e, t, n, r);
	}
	applyResolvedProperty(e, t, n, r, i) {
		if (!n) return e.properties.has(t) ? (e.properties.delete(t), this.markDirty(e, i), !0) : !1;
		let a = e.getProperty(t);
		return !Object.is(a, r) && (e.setProperty(t, r), this.markDirty(e, i), !0);
	}
	processDirty(e) {
		let t = this.dirtyNodes.take();
		if (t.length <= 1) {
			t.length === 1 && this.traverse(t[0], e);
			return;
		}
		let n = /* @__PURE__ */ new Set();
		for (let r of t) this.traverseOnce(r, n, e);
	}
	traverseOnce(e, t, n) {
		if (t.has(e)) return;
		t.add(e), n(e);
		let r = e.firstChild;
		for (; r !== null;) this.traverseOnce(r, t, n), r = r.nextSibling;
	}
	traverse(e, t) {
		t(e);
		let n = e.firstChild;
		for (; n !== null;) this.traverse(n, t), n = n.nextSibling;
	}
	traverseChildren(e, t) {
		let n = e.firstChild;
		for (; n !== null;) t(n), n = n.nextSibling;
	}
	buildNodeEnvironment(e, t = e.parent) {
		let n = (t === null ? null : t.environment) ?? new yn(null), r = e.getProperty("theme");
		r !== void 0 && (n = n.set(P.theme, r));
		let i = e.getProperty("textStyle");
		if (i !== void 0) {
			let e = n.get(P.theme).typography;
			if (er(i, e)) {
				let t = e[i];
				n = n.set(P.textStyle, t);
			} else typeof i != "string" && (n = n.set(P.textStyle, i));
		}
		let a = e.getProperty("contentColor");
		a !== void 0 && (n = n.set(P.contentColor, a));
		let o = e.getProperty("containerSize");
		o !== void 0 && (n = n.set(P.containerSize, o));
		let s = e.getProperty("insets");
		return s !== void 0 && (n = n.set(P.insets, s)), n;
	}
	setNodeEnvironment(e, t) {
		return e.environment !== t && (e.environment = t, !0);
	}
	inheritEnvironment(e) {
		if (e.parent?.environment == null) return;
		let t = (e) => {
			let n = e.environment, r = this.buildNodeEnvironment(e);
			(n === null || !this.environmentsEqual(n, r)) && (e.environment = r, n !== null && this.markDirty(e, Ei), this.environmentChangedListener?.(e));
			for (let n = e.firstChild; n !== null; n = n.nextSibling) t(n);
		};
		t(e);
	}
	propagateEnvironment(e) {
		this.rebuildEnvironment(e, Ei);
	}
	processEnvironmentDirty() {
		this.environmentDirty = !1;
		let e = this.dirtyNodes.take();
		this.suppressDirtyListener = !0;
		try {
			for (let t of e) (t.dirtyFlags & k.Environment) !== 0 && (t.dirtyFlags &= ~k.Environment, this.rebuildEnvironment(t, Ei)), t.dirtyFlags !== k.None && this.dirtyNodes.mark(t);
		} finally {
			this.suppressDirtyListener = !1;
		}
	}
	rebuildEnvironment(e, t) {
		let n = e.environment, r = this.buildNodeEnvironment(e);
		(n === null || !this.environmentsEqual(n, r)) && (e.environment = r, this.markDirty(e, t), this.environmentChangedListener?.(e));
		let i = e.firstChild;
		for (; i !== null;) this.rebuildEnvironment(i, t), i = i.nextSibling;
	}
	environmentsEqual(e, t) {
		if (e === t) return !0;
		if (e.providedSize !== t.providedSize) return !1;
		for (let n of e.providedKeys()) {
			if (!t.providesOwn(n)) return !1;
			let r = e.getOwn(n), i = t.getOwn(n);
			if (Object.is(r, i)) continue;
			let a = Sn(n)?.compare;
			if (a === void 0 || !a(r, i)) return !1;
		}
		return !0;
	}
}, Oi = /^on[A-Z]/, ki = {
	onPointerDown: j.PointerDown,
	onPointerUp: j.PointerUp,
	onPointerMove: j.PointerMove,
	onPointerCancel: j.PointerCancel,
	onPointerEnter: j.PointerEnter,
	onPointerLeave: j.PointerLeave,
	onWheel: j.Wheel,
	onKeyDown: j.KeyDown,
	onKeyUp: j.KeyUp,
	onFocus: j.Focus,
	onPaste: j.Paste,
	onBlur: j.Blur,
	onBeforeInput: j.BeforeInput,
	onInput: j.Input,
	onClick: j.Click,
	onLongPress: j.LongPress,
	onDragStart: j.DragStart,
	onDragMove: j.DragMove,
	onDragEnd: j.DragEnd,
	onPanStart: j.PanStart,
	onPanMove: j.PanMove,
	onPanEnd: j.PanEnd,
	onContextMenu: j.ContextMenu,
	onPinchStart: j.PinchStart,
	onPinchMove: j.PinchMove,
	onPinchEnd: j.PinchEnd
};
function Ai(e, t) {
	return typeof t == "function" && Oi.test(e);
}
function ji(e) {
	return ki[e];
}
function Mi() {
	return Object.keys(ki).sort();
}
//#endregion
//#region packages/core/src/properties/UiPropertyResolver.ts
function V(e, t) {
	let n = e.properties.get(t.name);
	if (n !== void 0) return n;
	if (t.inherited && e.environment !== null) {
		let n = t.environmentKey;
		if (n !== void 0) {
			let r = e.environment.get(n);
			return t.resolveFromEnvironment === void 0 ? r : t.resolveFromEnvironment(r);
		}
		let r = e.environment.get(Ri(t));
		if (r !== void 0) return r;
	}
	return t.defaultValue;
}
function Ni(e, t) {
	let n = xi(t);
	if (n !== void 0) return V(e, n);
}
function Pi(e, t) {
	let n = Ni(e, t);
	if (typeof n == "number" && Number.isFinite(n)) return n;
}
function Fi(e, t) {
	let n = Ni(e, t);
	if (typeof n == "string" && n.length > 0) return n;
}
function Ii(e, t) {
	let n = Ni(e, t);
	if (typeof n == "boolean") return n;
}
var Li = /* @__PURE__ */ new Map();
function Ri(e) {
	let t = Li.get(e.name);
	return t === void 0 && (t = {
		name: e.name,
		defaultValue: e.defaultValue,
		compare: e.compare
	}, Li.set(e.name, t)), t;
}
//#endregion
//#region packages/core/src/modifiers/sameArgs.ts
function zi(e, t, n = 0) {
	if (Object.is(e, t)) return !0;
	if (n > 8 || typeof e != "object" || typeof t != "object" || e === null || t === null) return !1;
	if (Array.isArray(e) || Array.isArray(t)) {
		if (!Array.isArray(e) || !Array.isArray(t) || e.length !== t.length) return !1;
		for (let r = 0; r < e.length; r++) if (!zi(e[r], t[r], n + 1)) return !1;
		return !0;
	}
	if (!Bi(e) || !Bi(t)) return !1;
	let r = Object.keys(e), i = Object.keys(t);
	if (r.length !== i.length) return !1;
	for (let i of r) if (!Object.prototype.hasOwnProperty.call(t, i) || !zi(e[i], t[i], n + 1)) return !1;
	return !0;
}
function Bi(e) {
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
//#endregion
//#region packages/core/src/modifiers/UiModifierSet.ts
var Vi = class extends Error {}, Hi = class {
	node;
	graph;
	dispatcher;
	layout;
	focus;
	environment;
	animations;
	sharedElements;
	attached = [];
	decorations = null;
	constructor(e, t, n, r, i, a, o, s) {
		this.node = e, this.graph = t, this.dispatcher = n, this.layout = r, this.focus = i, this.environment = a, this.animations = o, this.sharedElements = s;
	}
	decorationsFor() {
		return this.decorations === null && (this.decorations = new Wi(this.node, this.graph)), this.decorations;
	}
	get names() {
		return this.attached.map((e) => e.kind.name);
	}
	get size() {
		return this.attached.length;
	}
	reconcile(e) {
		let t = this.attached, n = /* @__PURE__ */ new Set(), r = [], i = /* @__PURE__ */ new Map();
		for (let a of e) {
			let e = a.kind, o = i.get(e.key) ?? 0;
			i.set(e.key, o + 1);
			let s = a.key ?? o, c = t.find((t) => t.kind.key === e.key && t.slot === s && !n.has(t));
			if (c === void 0) {
				let t = this.attach(e, s, a.args);
				t !== null && r.push(t);
				continue;
			}
			n.add(c);
			let l = this.update(c, a.args);
			l !== null && r.push(l);
		}
		for (let [e, t] of r.entries()) t.host.setOrder(e);
		this.decorations?.reorder();
		for (let e of t) n.has(e) || this.detachOne(e);
		this.attached = r;
	}
	detach() {
		for (let e = this.attached.length - 1; e >= 0; e--) this.detachOne(this.attached[e]);
		this.attached = [];
	}
	attach(e, t, n) {
		let r = new Ui(this.node, this.graph, e.name, () => this.decorationsFor(), {
			dispatcher: this.dispatcher,
			layout: this.layout,
			focus: this.focus,
			environment: this.environment,
			animations: this.animations,
			sharedElements: this.sharedElements
		}), i = {
			kind: e,
			slot: t,
			host: r,
			args: n
		};
		try {
			e.attach(r, n);
		} catch (t) {
			if (r.release(), t instanceof Vi) throw t;
			return this.graph.handleModifierError(e.name, this.node, "attach", t), null;
		}
		return i;
	}
	update(e, t) {
		if (zi(e.args, t)) return e.args = t, e;
		if (e.kind.update === void 0) return this.detachOne(e), this.attach(e.kind, e.slot, t);
		let n = e.args;
		e.args = t;
		try {
			e.kind.update(e.host, t, n);
		} catch (t) {
			if (this.detachOne(e), t instanceof Vi) throw t;
			return this.graph.handleModifierError(e.kind.name, this.node, "update", t), null;
		}
		return e;
	}
	detachOne(e) {
		try {
			e.kind.detach?.(e.host);
		} catch (t) {
			if (t instanceof Vi) throw e.host.release(), t;
			this.graph.handleModifierError(e.kind.name, this.node, "detach", t);
		}
		e.host.release();
	}
}, Ui = class {
	node;
	graph;
	name;
	decorations;
	services;
	teardowns = [];
	source;
	written = /* @__PURE__ */ new Set();
	subscriptions = /* @__PURE__ */ new Map();
	order = 0;
	decorated = !1;
	animated = /* @__PURE__ */ new Set();
	constructor(e, t, n, r, i) {
		this.node = e, this.graph = t, this.name = n, this.decorations = r, this.services = i, this.source = Symbol(n);
	}
	setOrder(e) {
		if (e !== this.order) {
			this.order = e;
			for (let e of this.written) this.write(e, this.node.properties.get(e));
			this.decorated && this.decorations().setOrder(this.source, e);
		}
	}
	get(e) {
		let t = xi(e);
		if (t === void 0) throw new Vi(`Modifier '${this.name}' read unknown property '${e}' on node '${this.node.id}'.`);
		return V(this.node, t);
	}
	set(e, t) {
		if (xi(e) === void 0) throw new Vi(`Modifier '${this.name}' wrote unknown property '${e}' on node '${this.node.id}'.`);
		if (this.subscriptions.get(e)?.unsubscribe(), this.subscriptions.delete(e), Se(t)) {
			this.subscriptions.set(e, t.subscribe((t) => this.write(e, t))), this.written.add(e);
			return;
		}
		this.write(e, t);
	}
	clear(e) {
		this.subscriptions.get(e)?.unsubscribe(), this.subscriptions.delete(e), this.written.delete(e) && fn(this.graph, this.node, e, this.source, Ci(e));
	}
	on(e, t, n) {
		let r = this.services.dispatcher;
		if (r === void 0) {
			Ji(this.name);
			return;
		}
		r.addEventListener(this.node, e, t, n), this.own(() => r.removeEventListener(this.node, e, t, n));
	}
	onRoot(e, t, n = { capture: !0 }) {
		let r = this.services.dispatcher;
		if (r === void 0) {
			Ji(this.name);
			return;
		}
		let i = this.graph.root;
		r.addEventListener(i, e, t, n), this.own(() => r.removeEventListener(i, e, t, n));
	}
	layoutBox() {
		return this.services.layout?.box(this.node) ?? null;
	}
	flowBox() {
		return this.services.layout?.flowBox(this.node) ?? null;
	}
	viewportBox() {
		return this.services.layout?.viewport?.() ?? null;
	}
	onLayout(e) {
		let t = this.services.layout;
		if (t === void 0) {
			Ki(this.name);
			return;
		}
		this.own(t.onLayout(this.node, e));
	}
	environment(e) {
		let t = this.services.environment;
		return t === void 0 ? e.defaultValue : t.read(this.node, e);
	}
	onEnvironment(e) {
		let t = this.services.environment;
		if (t === void 0) {
			Xi(this.name, "follow its environment", "environment");
			return;
		}
		this.own(t.onChange(this.node, e));
	}
	focus() {
		let e = this.services.focus;
		if (e === void 0) {
			Xi(this.name, "move focus", "focus");
			return;
		}
		e.focus(this.node);
	}
	isFocused() {
		return this.services.focus?.isFocused(this.node) ?? !1;
	}
	isFocusVisible() {
		return this.services.focus?.isFocusVisible(this.node) ?? !1;
	}
	onFocusChange(e) {
		let t = this.services.focus;
		if (t === void 0) {
			Xi(this.name, "follow focus", "focus");
			return;
		}
		this.own(t.onFocusChange(this.node, e));
	}
	decorate(e) {
		this.decorated = e !== null, this.decorations().set(this.source, this.order, e);
	}
	animate(e, t, n) {
		let r = this.services.animations, i = r === void 0 ? void 0 : vt(e, t, n);
		return r === void 0 || i === void 0 ? (r === void 0 && Xi(this.name, "animate a value", "animations"), e.value = t, xe) : (this.animated.add(e), r.start(i));
	}
	spring(e, t, n) {
		let r = this.services.animations;
		if (r === void 0) return Xi(this.name, "animate a value", "animations"), e.value = t, xe;
		this.animated.add(e);
		let i = r.animationFor(e), a = n.velocity ?? (i instanceof gt ? i.currentVelocity : 0);
		return r.start(new gt(e, t, {
			...n,
			velocity: a
		}));
	}
	own(e) {
		this.teardowns.push(e);
	}
	scrollOffset() {
		return this.services.layout?.scroll(this.node) ?? null;
	}
	stopAnimation(e) {
		this.services.animations?.stop(e);
	}
	get shared() {
		let e = this.services.sharedElements;
		return e === void 0 ? (Xi(this.name, "share an element across a tree change", "sharedElements"), null) : e;
	}
	requestFrame() {
		this.graph.markDirty(this.node, k.Paint);
	}
	write(e, t) {
		this.written.add(e), dn(this.graph, this.node, e, {
			source: this.source,
			name: this.name,
			order: this.order,
			value: t
		}, Ci(e));
	}
	release() {
		for (let e of this.written) this.clear(e);
		this.decorated && this.decorate(null);
		for (let e of this.animated) this.services.animations?.stop(e);
		this.animated.clear();
		let e = this.teardowns;
		this.teardowns = [];
		for (let t = e.length - 1; t >= 0; t--) {
			let n = e[t];
			typeof n == "function" ? n() : n.unsubscribe();
		}
	}
}, Wi = class {
	node;
	graph;
	bySource = /* @__PURE__ */ new Map();
	constructor(e, t) {
		this.node = e, this.graph = t;
	}
	set(e, t, n) {
		if (n === null || n.length === 0) {
			if (!this.bySource.delete(e)) return;
		} else this.bySource.set(e, {
			order: t,
			shapes: n
		});
		this.rebuild();
	}
	setOrder(e, t) {
		let n = this.bySource.get(e);
		n !== void 0 && n.order !== t && (n.order = t, this.rebuild());
	}
	reorder() {
		this.bySource.size > 1 && this.rebuild();
	}
	rebuild() {
		if (this.bySource.size === 0) {
			this.node.decorations = null, this.graph.markDirty(this.node, k.Paint);
			return;
		}
		let e = [];
		for (let t of [...this.bySource.values()].sort((e, t) => e.order - t.order)) e.push(...t.shapes);
		this.node.decorations = e, this.graph.markDirty(this.node, k.Paint);
	}
}, Gi = !1;
function Ki(e) {
	Gi || (Gi = !0, console.warn(`Modifier '${e}' asked to follow its node's box, but the UiGraphBuilder was constructed without layout access. Construct it with { layout } for onLayout to fire.`));
}
var qi = !1;
function Ji(e) {
	qi || (qi = !0, console.warn(`Modifier '${e}' asked to listen for input, but the UiGraphBuilder was constructed without a dispatcher. Construct it with { dispatcher } for modifiers to receive events.`));
}
var Yi = /* @__PURE__ */ new Set();
function Xi(e, t, n) {
	Yi.has(n) || (Yi.add(n), console.warn(`Modifier '${e}' asked to ${t}, but the UiGraphBuilder was constructed without ${n} access. Construct it with { ${n} }, as the runtime does.`));
}
function Zi(e, t) {
	if (!Array.isArray(t)) throw Error(`The 'modifiers' prop on node '${e.id}' must be an array, got ${typeof t}.`);
	for (let n of t) if (!Zt(n)) throw Error(`The 'modifiers' prop on node '${e.id}' must hold modifiers built by a factory from defineModifier.`);
	return t;
}
//#endregion
//#region packages/core/src/graph/UiPropertyTransitions.ts
var Qi = class {
	node;
	graph;
	driver;
	specs = /* @__PURE__ */ new Map();
	cells = /* @__PURE__ */ new Map();
	targets = /* @__PURE__ */ new Map();
	constructor(e, t, n) {
		this.node = e, this.graph = t, this.driver = n;
	}
	setSpecs(e) {
		for (let t of this.cells.keys()) e.has(t) || this.stopProperty(t);
		this.specs = e;
	}
	get size() {
		return this.specs.size;
	}
	write(e, t, n) {
		let r = this.specs.get(e);
		if (r === void 0 || !this.node.properties.has(e)) return !1;
		let i = this.node.properties.get(e);
		if (Object.is(i, t)) return !1;
		if (this.cells.has(e) && Object.is(this.targets.get(e), t)) return !0;
		let a = this.cellFor(e, n);
		return this.startAnimation(a, t, r, e) ? (this.targets.set(e, t), !0) : (this.stopProperty(e), !1);
	}
	release() {
		for (let e of this.cells.values()) this.driver.stop(e);
		this.cells.clear(), this.targets.clear(), this.specs = /* @__PURE__ */ new Map();
	}
	stopProperty(e) {
		let t = this.cells.get(e);
		t !== void 0 && (this.driver.stop(t), this.cells.delete(e)), this.targets.delete(e);
	}
	cellFor(e, t) {
		let n = this.cells.get(e);
		if (n !== void 0) return n;
		let r = this.node, i = this.graph;
		return n = {
			get value() {
				return r.properties.get(e);
			},
			set value(n) {
				i.updateNodePropertyNow(r, e, n, t);
			}
		}, this.cells.set(e, n), n;
	}
	startAnimation(e, t, n, r) {
		if (n.kind === "spring") {
			if (typeof e.value != "number" || typeof t != "number") return ea(r), !1;
			let i = this.driver.animationFor(e), a = i instanceof gt ? i.currentVelocity : 0;
			return this.driver.start(new gt(e, t, {
				spring: n.spring,
				velocity: a,
				restDelta: n.restDelta,
				reducedMotion: n.reducedMotion
			})), !0;
		}
		let i = vt(e, t, {
			duration: n.duration,
			easing: n.easing,
			stepMs: n.stepMs,
			reducedMotion: n.reducedMotion
		});
		return i === void 0 ? (ea(r), !1) : (this.driver.start(i), !0);
	}
}, $i = /* @__PURE__ */ new Set();
function ea(e) {
	$i.has(e) || ($i.add(e), console.warn(`A 'transition' was declared for '${e}', but its values cannot be blended, so it is written directly. Numbers, UiColor objects and transforms can be animated; typed lengths (percent, fr, auto) and palette names cannot. See interpolatorFor in packages/core/src/animation/Interpolate.ts.`));
}
//#endregion
//#region packages/core/src/composition/UiGraphBuilder.ts
var ta = "key", na = "ref", ra = "modifiers", ia = "transition";
function aa() {
	return Si();
}
function oa(e) {
	return e === null ? "null" : Array.isArray(e) ? "an array" : typeof e == "object" ? "an object" : `a ${typeof e}`;
}
var sa = class {
	graph;
	refs = /* @__PURE__ */ new Map();
	modifiers = /* @__PURE__ */ new Map();
	nextChildrenBindingId = 0;
	reconcileDepth = 0;
	reconciling = /* @__PURE__ */ new Set();
	deferredChildren = /* @__PURE__ */ new Map();
	components;
	dispatcher;
	layout;
	focus;
	modifierEnvironment;
	animations;
	sharedElements;
	warnedAboutDispatcher = !1;
	warnedAboutAnimations = !1;
	warnedAboutIndexKeys = !1;
	constructor(e, t = {}) {
		this.graph = e, this.components = t.components, this.dispatcher = t.dispatcher, this.layout = t.layout, this.focus = t.focus, this.modifierEnvironment = t.environment, this.animations = t.animations, this.sharedElements = t.sharedElements;
	}
	build(e, t) {
		let n = t === void 0 ? this.graph.root : this.graph.requireNode(t);
		return this.reconcileChildren(n, [e]).nodes[0];
	}
	reconcileChildren(e, t) {
		if (this.reconciling.has(e)) return this.deferredChildren.set(e, t), {
			nodes: this.collectChildren(e),
			changed: !1
		};
		this.reconciling.add(e), this.reconcileDepth++;
		let n;
		try {
			n = this.reconcile(e, t);
		} finally {
			this.reconcileDepth--, this.reconciling.delete(e);
		}
		let r = this.deferredChildren.get(e);
		return r === void 0 ? (this.reconcileDepth === 0 && this.components?.flushMounts(), n) : (this.deferredChildren.delete(e), this.reconcileChildren(e, r));
	}
	reconcile(e, t) {
		let n = this.collectChildren(e), r = /* @__PURE__ */ new Set(), i = {
			existing: n,
			cursors: null
		};
		!this.warnedAboutIndexKeys && t.length > 1 && e.type === A.Fragment && (this.warnedAboutIndexKeys = t.every((e) => this.isIndexKeyed(e)), this.warnedAboutIndexKeys && console.warn(`A list of ${t.length} children under '${e.id}' arrived from an observable with no keys, so it is reconciled by index. Give each child a key, or build the list with \`each\`, which supplies one: each(items, 'id', item => ...).`));
		let a = [], o = !1, s = e.firstChild;
		for (let [n, c] of t.entries()) {
			if (At(c)) {
				let t = this.reconcileObservableChild(e, n, c, r, s);
				t !== void 0 && (this.moveBefore(e, t, s) && (o = !0), s = t.nextSibling, a.push(t));
				continue;
			}
			if (kt(c)) {
				let t = this.reconcileComponentChild(e, n, c, r, s);
				this.moveBefore(e, t, s) && (o = !0), s = t.nextSibling, a.push(t);
				continue;
			}
			let t = this.matchNode(e, c, i, r);
			if (t === void 0) {
				let i = this.createNodeId(e, c, n), a = this.graph.getNode(i);
				if (a !== void 0) {
					if (a.parent !== e) throw Error(`Node id '${i}' is already used outside parent '${e.id}'.`);
					s === a && (s = a.nextSibling), this.removeSubtree(a), r.add(a), o = !0;
				}
				t = this.createNode(e, c, n), r.add(t), o = !0;
			} else r.add(t), this.reconcileProps(t, c.props), this.reconcileChildren(t, c.children).changed && (o = !0);
			this.moveBefore(e, t, s) && (o = !0), s = t.nextSibling, a.push(t);
		}
		for (let e of n) r.has(e) || (this.removeSubtree(e), o = !0);
		return o && this.graph.markDirty(e, k.Children), {
			nodes: a,
			changed: o
		};
	}
	reconcileObservableChild(e, t, n, r, i) {
		let a = this.createFragmentId(e, t), o = this.graph.getNode(a);
		o !== void 0 && o.type !== A.Fragment && (i === o && (i = o.nextSibling), this.removeSubtree(o), r.add(o), o = void 0), o === void 0 ? (o = this.graph.createNode(a, A.Fragment), this.graph.insertBefore(e, o, i)) : r.add(o);
		let s = this.graph.getChildrenBindingForNode(o);
		if (s === void 0 || s.observable !== n) {
			s !== void 0 && this.graph.unbindChildren(o);
			let t = new Dt(this.nextChildrenBindingId++, e.id, o.id, n, this.graph, this);
			this.graph.bindChildren(o, t);
		}
		return o;
	}
	reconcileComponentChild(e, t, n, r, i) {
		let a = this.components;
		if (a === void 0) throw Error(`Component '${n.tag}' was passed to a UiGraphBuilder with no ComponentResolver. Construct the builder with { components } to mount components.`);
		if (n.props[ra] !== void 0) throw Error(`Component '${n.tag}' cannot take 'modifiers': a component's node is its anchor, which is a fragment with no box and no paint, so there is nothing for a modifier to attach to. Put them on an element the component renders, or, if the component offers it, pass 'rootModifiers', which is the convention for a component that places them on its own root element (see 'modifiersOf').`);
		let o = this.createComponentAnchorId(e, n, t), s = this.graph.getNode(o);
		return s !== void 0 && s.type !== A.Fragment && (i === s && (i = s.nextSibling), this.removeSubtree(s), r.add(s), s = void 0), s === void 0 ? (s = this.graph.createNode(o, A.Fragment), this.graph.insertBefore(e, s, i)) : r.add(s), this.reconcileChildren(s, [a.resolve(n, o)]), s;
	}
	removeSubtree(e) {
		let t = this.components, n = [e];
		for (; n.length > 0;) {
			let e = n.pop();
			t !== void 0 && e.type === A.Fragment && t.release(e.id);
			let r = this.refs.get(e);
			r !== void 0 && (this.refs.delete(e), r(null));
			let i = this.modifiers.get(e);
			i !== void 0 && (this.modifiers.delete(e), i.detach()), e.transitions !== null && (e.transitions.release(), e.transitions = null);
			for (let t = e.firstChild; t !== null; t = t.nextSibling) n.push(t);
		}
		this.graph.removeNode(e);
	}
	reconcileRef(e, t) {
		let n = this.refs.get(e);
		if (typeof t != "function") {
			n !== void 0 && (this.refs.delete(e), n(null));
			return;
		}
		let r = t;
		n !== r && (n !== void 0 && n(null), this.refs.set(e, r), r(e));
	}
	matchNode(e, t, n, r) {
		let i = this.elementKey(t);
		if (i !== void 0) {
			let n = this.graph.getNode(`${e.id}:${i}`);
			if (n === void 0 || n.parent !== e || n.type !== t.type) return;
			if (r.has(n)) throw Error(`Duplicate key '${i}' in parent '${e.id}'.`);
			return n;
		}
		let a = n.existing, o = t.type, s = n.cursors;
		s === null && (s = /* @__PURE__ */ new Map(), n.cursors = s);
		let c = s.get(o) ?? 0;
		for (; c < a.length && (r.has(a[c]) || a[c].type !== o);) c++;
		return s.set(o, c), c < a.length ? a[c] : void 0;
	}
	createNode(e, t, n) {
		let r = this.createNodeId(e, t, n), i = this.graph.createNode(r, t.type);
		return this.reconcileProps(i, t.props, e), this.reconcileChildren(i, t.children), i;
	}
	moveBefore(e, t, n) {
		return t.parent === e ? t === n || t.nextSibling === n ? !1 : (this.graph.detachNode(t), this.graph.insertBefore(e, t, n), !0) : (this.graph.insertBefore(e, t, n), !0);
	}
	reconcileProps(e, t, n) {
		this.reconcileTransitions(e, t[ia]);
		let r = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), a;
		for (let [n, o] of Object.entries(t)) {
			if (n === ta) continue;
			if (n === na) {
				this.reconcileRef(e, o);
				continue;
			}
			if (n === ra) {
				a = o;
				continue;
			}
			if (n === ia) continue;
			if (Ai(n, o)) {
				this.reconcileEventProp(e, n, o, i);
				continue;
			}
			this.assertKnownProp(e, n, o), r.add(n), this.assertValidValue(e, n, o);
			let t = this.graph.getBindingForProperty(e, n);
			if (this.isObservable(o)) {
				if (t !== void 0 && t.observable === o) continue;
				t !== void 0 && this.graph.unbind(t), this.graph.bind(e, n, o, Ci(n));
				continue;
			}
			t !== void 0 && this.graph.unbind(t), this.graph.updateNodeProperty(e, n, o, Ci(n));
		}
		for (let t of this.graph.getBindingsForNode(e)) r.has(t.property) || this.graph.unbind(t);
		for (let t of this.graph.getEventBindingsForNode(e)) i.has(t.type) || this.graph.unbindEvent(e, t);
		e.environment === null && n?.environment != null && (e.environment = this.graph.buildNodeEnvironment(e, n)), this.reconcileModifiers(e, a);
	}
	reconcileModifiers(e, t) {
		let n = this.modifiers.get(e);
		if (t === void 0) {
			n !== void 0 && (n.detach(), this.modifiers.delete(e));
			return;
		}
		let r = Zi(e, t), i = n ?? new Hi(e, this.graph, this.dispatcher, this.layout, this.focus, this.modifierEnvironment, this.animations, this.sharedElements);
		n === void 0 && this.modifiers.set(e, i), i.reconcile(r);
	}
	reconcileTransitions(e, t) {
		if (t === void 0) {
			e.transitions !== null && (e.transitions.release(), e.transitions = null);
			return;
		}
		let n = bt(e.id, t, (e) => xi(e) !== void 0), r = this.animations;
		if (r === void 0) {
			this.warnMissingAnimations();
			return;
		}
		let i = e.transitions;
		i === null && (i = new Qi(e, this.graph, r), e.transitions = i), i.setSpecs(n);
	}
	warnMissingAnimations() {
		this.warnedAboutAnimations || (this.warnedAboutAnimations = !0, console.warn("An element declared a 'transition', but the UiGraphBuilder was constructed without an animation driver. Values are written directly. Construct it with { animations }, as the runtime does."));
	}
	modifiersFor(e) {
		return this.modifiers.get(e);
	}
	assertKnownProp(e, t, n) {
		if (xi(t) !== void 0) return;
		if (ji(t) !== void 0) throw Error(`Event prop '${t}' on node '${e.id}' must be a function, got ${oa(n)}.`);
		let r = wi(t, [...aa(), ...Mi()]);
		throw Error(`Unknown prop '${t}' on node '${e.id}'.` + (r === void 0 ? "" : ` Did you mean '${r}'?`) + " Props must be registered UI properties (width, padding, backgroundColor, …), 'key', 'ref', 'modifiers', 'transition', or on* event handlers.");
	}
	assertValidValue(e, t, n) {
		let r = xi(t);
		if (r?.validate === void 0 || this.isObservable(n)) return;
		let i = r.validate(n);
		if (i !== void 0) throw Error(`Invalid '${t}' on node '${e.id}': ${i}`);
	}
	reconcileEventProp(e, t, n, r) {
		let i = ji(t);
		if (i === void 0) throw Error(`Unknown event prop '${t}' on node '${e.id}'. Expected one of: ${Mi().join(", ")}.`);
		r.add(i);
		let a = this.graph.getEventBindingForType(e, i);
		if (a !== void 0) {
			if (a.listener === n) return;
			this.graph.unbindEvent(e, a);
		}
		if (this.dispatcher === void 0) {
			this.warnMissingDispatcher(t);
			return;
		}
		this.graph.bindEvent(e, new Ot(e, i, n, this.dispatcher));
	}
	warnMissingDispatcher(e) {
		this.warnedAboutDispatcher || (this.warnedAboutDispatcher = !0, console.warn(`UiGraphBuilder received event prop '${e}' but was constructed without a dispatcher, so it and any further event props are ignored. Pass { dispatcher } to make the tree interactive.`));
	}
	isObservable(e) {
		return At(e);
	}
	isIndexKeyed(e) {
		return At(e) ? !0 : kt(e) ? e.key === void 0 || e.key === null : this.elementKey(e) === void 0;
	}
	elementKey(e) {
		let t = e.props[ta];
		if (t != null) return String(t);
	}
	collectChildren(e) {
		let t = [];
		for (let n = e.firstChild; n !== null; n = n.nextSibling) t.push(n);
		return t;
	}
	createNodeId(e, t, n) {
		let r = this.elementKey(t);
		return r === void 0 ? `${e.id}:${n}` : `${e.id}:${r}`;
	}
	createFragmentId(e, t) {
		return `${e.id}:fragment:${t}`;
	}
	createComponentAnchorId(e, t, n) {
		let r = t.key === void 0 || t.key === null ? n : t.key;
		return `${e.id}:component:${String(r)}`;
	}
}, ca = "virtualIndex", la = "virtualLead", ua = "virtualWindow", da = class {
	axis;
	children$;
	count;
	estimate;
	overscan;
	keyOf;
	renderItem;
	grid;
	first = 0;
	last = -1;
	leadExtent = -1;
	trailExtent = -1;
	measured = /* @__PURE__ */ new Map();
	corrections = [];
	mountedItems = /* @__PURE__ */ new Map();
	viewport;
	recentContentExtents = [];
	lastViewportExtent = -1;
	viewportLandedOnContent = 0;
	warnedAboutViewport = !1;
	constructor(e, t, n) {
		let r = typeof t.count == "number" ? t.count : 0;
		if (ma(r), !(t.estimatedExtent > 0)) throw Error(`LazyList estimatedExtent must be positive, got ${String(t.estimatedExtent)}.`);
		this.axis = e, this.count = r, this.estimate = t.estimatedExtent, this.overscan = t.overscan ?? 3, this.keyOf = t.key ?? ((e) => e), this.renderItem = n, this.grid = t.grid, this.children$ = new be([]), this.viewport = {
			scroll: 0,
			extent: t.initialViewportExtent ?? 600
		}, this.update(this.viewport, []);
	}
	get length() {
		return this.count;
	}
	setCount(e) {
		if (ma(e), e !== this.count) {
			this.count = e;
			for (let t of this.measured.keys()) t >= e && this.measured.delete(t);
			this.corrections = this.corrections.filter((t) => t.index < e), this.mountedItems.clear(), this.refresh();
		}
	}
	invalidate() {
		this.measured.clear(), this.corrections = [], this.mountedItems.clear(), this.refresh();
	}
	get range() {
		return {
			first: this.first,
			last: this.last
		};
	}
	offsetOf(e) {
		let t = e * this.estimate;
		for (let n of this.corrections) {
			if (n.index >= e) break;
			t += n.delta;
		}
		return t;
	}
	totalExtent() {
		return this.offsetOf(this.count);
	}
	extentOf(e) {
		return this.measured.get(e) ?? this.estimate;
	}
	indexAt(e) {
		if (this.count === 0) return 0;
		let t = 0, n = this.count - 1;
		for (; t < n;) {
			let r = t + n + 1 >> 1;
			this.offsetOf(r) <= e ? t = r : n = r - 1;
		}
		return t;
	}
	update(e, t) {
		this.viewport = e;
		let n = this.last >= this.first ? this.offsetOf(this.first) : 0;
		for (let e of t) this.record(e.index, e.extent);
		let r = (this.last >= this.first ? this.offsetOf(this.first) : 0) - n, i = this.totalExtent(), a = e.lead ?? 0;
		this.checkViewport(e.extent, i + a);
		let o = pa(e.scroll + r, 0, Math.max(0, i + a - e.extent)), s = Math.max(0, o - a), c = 0, l = -1;
		this.count > 0 && (c = Math.max(0, this.indexAt(s) - this.overscan), l = Math.min(this.count - 1, this.indexAt(s + Math.max(0, e.extent)) + this.overscan));
		let u = c <= l ? this.offsetOf(c) : 0, d = c <= l ? i - this.offsetOf(l + 1) : i;
		return (c !== this.first || l !== this.last || u !== this.leadExtent || d !== this.trailExtent) && (this.first = c, this.last = l, this.leadExtent = u, this.trailExtent = d, this.children$.next(this.buildChildren())), { scrollAdjust: r };
	}
	checkViewport(e, t) {
		if (!this.warnedAboutViewport && e !== this.lastViewportExtent) {
			if (this.recentContentExtents.some((t) => Math.abs(t - e) < .5) && (this.viewportLandedOnContent++, this.viewportLandedOnContent >= 2)) {
				this.warnedAboutViewport = !0;
				let t = this.grid === void 0 ? this.axis === "column" ? "LazyColumn" : "LazyRow" : "LazyGrid", n = this.axis === "column" ? "height" : "width", r = this.axis === "column" ? "minHeight" : "minWidth";
				console.warn(`A ${t} of ${this.count} items has a viewport the size of its content (${Math.round(e)}px), so every item is mounted and nothing is virtualised. The list is taking its items' ${n} rather than being bounded by what holds it: give it a definite ${n}, or, when a wrapper between it and a flex parent is the one growing, put ${r}: 0 on that wrapper.`);
			}
			this.lastViewportExtent = e;
		}
		this.recentContentExtents[this.recentContentExtents.length - 1] !== t && (this.recentContentExtents.push(t), this.recentContentExtents.length > 4 && this.recentContentExtents.shift());
	}
	refresh() {
		this.first = 0, this.last = -1, this.leadExtent = -1, this.trailExtent = -1, this.update(this.viewport, []);
	}
	record(e, t) {
		if (e < 0 || e >= this.count || !(t >= 0) || this.measured.get(e) === t) return;
		this.measured.set(e, t);
		let n = t - this.estimate, r = 0;
		for (; r < this.corrections.length && this.corrections[r].index < e;) r++;
		let i = this.corrections[r];
		i !== void 0 && i.index === e ? n === 0 ? this.corrections.splice(r, 1) : i.delta = n : n !== 0 && this.corrections.splice(r, 0, {
			index: e,
			delta: n
		});
	}
	buildChildren() {
		let e = [];
		this.grid?.header !== void 0 && e.push(fa(this.grid.header, {
			key: "lazy:header",
			[la]: !0
		}, "The header of")), e.push(this.spacer("lazy:lead", this.leadExtent));
		for (let e of this.mountedItems.keys()) (e < this.first || e > this.last) && this.mountedItems.delete(e);
		for (let t = this.first; t <= this.last; t++) {
			let n = this.mountedItems.get(t);
			n === void 0 && (n = this.wrap(t, this.renderItem(t)), this.mountedItems.set(t, n)), e.push(n);
		}
		return e.push(this.spacer("lazy:trail", this.trailExtent)), this.grid === void 0 ? e : [on({
			key: "lazy:grid",
			columns: this.grid.columns,
			columnGap: this.grid.columnGap,
			rowGap: 0,
			autoFlow: "row",
			width: Fr(100)
		}, ...e)];
	}
	spacer(e, t) {
		return this.grid === void 0 ? this.axis === "column" ? rn({
			key: e,
			height: t,
			flexShrink: 0
		}) : rn({
			key: e,
			width: t,
			flexShrink: 0
		}) : rn({
			key: e,
			height: t,
			columnSpan: this.grid.columns.length
		});
	}
	wrap(e, t) {
		let n = {
			key: `lazy:${String(this.keyOf(e))}`,
			[ca]: e
		};
		return this.grid === void 0 ? this.axis === "column" ? cn({
			...n,
			flexShrink: 0
		}, t) : sn({
			...n,
			flexShrink: 0
		}, t) : fa(t, n, `Row ${e} of`);
	}
};
function fa(e, t, n) {
	if (!Mt(e) || e.type !== A.Grid || e.props.subgrid !== "columns") throw Error(`${n} a lazy grid must be a Grid with subgrid: 'columns', so its cells share the tracks.`);
	return {
		...e,
		props: {
			...e.props,
			...t
		}
	};
}
function pa(e, t, n) {
	return Math.min(Math.max(e, t), n);
}
function ma(e) {
	if (!(e >= 0) || !Number.isInteger(e)) throw Error(`LazyList count must be a non-negative integer, got ${String(e)}.`);
}
Xt({
	name: "lazySource",
	attach(e, t) {
		if (ha(e, t.count, (e) => t.window.setCount(e)), t.revision !== void 0) {
			let n = !0;
			ha(e, t.revision, () => {
				if (n) {
					n = !1;
					return;
				}
				t.window.invalidate();
			});
		}
	}
});
function ha(e, t, n) {
	if (!Se(t)) {
		n(t);
		return;
	}
	e.own(t.subscribe((t) => {
		n(t), e.requestFrame();
	}));
}
//#endregion
//#region packages/core/src/composition/UiVirtualSheet.ts
var ga = "virtualSheet", _a = {
	firstRow: 0,
	lastRow: -1,
	firstColumn: 0,
	lastColumn: -1
}, va = class {
	children$ = new be([]);
	range$ = new be(_a);
	rowCount;
	columnCount;
	rowOverscan;
	columnOverscan;
	rowHeight;
	gutterWidth;
	headerHeight;
	frozenRows;
	frozenColumns;
	renderRow;
	renderHeader;
	extendRange;
	widths;
	offsets = [];
	uniformWidth = 0;
	exceptionRows = [];
	exceptionHeights = [];
	exceptionStarts = [];
	range = _a;
	viewport;
	mountedRows = /* @__PURE__ */ new Map();
	frozenMounted = /* @__PURE__ */ new Map();
	mountedHeader;
	constructor(e, t, n) {
		this.rowCount = typeof e.rowCount == "number" ? e.rowCount : 0, this.columnCount = typeof e.columnCount == "number" ? e.columnCount : 0, this.rowHeight = Sa("rowHeight", e.rowHeight), this.adoptHeights(e.rowHeights), this.gutterWidth = Math.max(0, e.gutterWidth ?? 0), this.headerHeight = Math.max(0, e.headerHeight ?? 0), this.frozenRows = Math.max(0, Math.floor(e.frozenRows ?? 0)), this.frozenColumns = Math.max(0, Math.floor(e.frozenColumns ?? 0)), this.rowOverscan = typeof e.rowOverscan == "number" ? e.rowOverscan : 3, this.columnOverscan = typeof e.columnOverscan == "number" ? e.columnOverscan : 2, this.renderRow = t, this.renderHeader = n, this.extendRange = e.extendRange, this.adoptWidths(e.columnWidth), this.viewport = {
			scrollX: 0,
			scrollY: 0,
			width: e.initialViewport?.width ?? 800,
			height: e.initialViewport?.height ?? 600
		}, this.recompute();
	}
	setColumnWidths(e) {
		this.adoptWidths(e), this.invalidate();
	}
	adoptWidths(e) {
		if (typeof e == "number") {
			this.uniformWidth = Sa("columnWidth", e), this.widths = void 0, this.offsets = [];
			return;
		}
		let t = e.slice();
		for (let e of t) if (!(e >= 0)) throw Error(`LazySheet column widths must not be negative, got ${String(e)}.`);
		this.widths = t, this.offsets = Array.from({ length: t.length + 1 });
		let n = 0;
		for (let e = 0; e < t.length; e++) this.offsets[e] = n, n += t[e];
		this.offsets[t.length] = n;
	}
	setRowHeights(e) {
		this.adoptHeights(e), this.invalidate();
	}
	setRowHeight(e) {
		let t = Sa("rowHeight", e);
		t !== this.rowHeight && (this.rowHeight = t, this.rebuildExceptionStarts(), this.invalidate());
	}
	adoptHeights(e) {
		if (this.exceptionRows = [], this.exceptionHeights = [], e !== void 0) {
			let t = [...e.keys()].sort((e, t) => e - t);
			for (let n of t) {
				let t = e.get(n) ?? 0;
				if (!(t >= 0)) throw Error(`LazySheet row heights must not be negative, got ${String(t)}.`);
				t !== this.rowHeight && (this.exceptionRows.push(n), this.exceptionHeights.push(t));
			}
		}
		this.rebuildExceptionStarts();
	}
	rebuildExceptionStarts() {
		this.exceptionStarts = Array(this.exceptionRows.length);
		let e = 0;
		for (let t = 0; t < this.exceptionRows.length; t++) this.exceptionStarts[t] = this.exceptionRows[t] * this.rowHeight + e, e += this.exceptionHeights[t] - this.rowHeight;
	}
	exceptionAt(e) {
		let t = 0, n = this.exceptionStarts.length - 1, r = -1;
		for (; t <= n;) {
			let i = t + n >> 1;
			this.exceptionStarts[i] <= e ? (r = i, t = i + 1) : n = i - 1;
		}
		return r;
	}
	exceptionsBefore(e) {
		let t = 0, n = this.exceptionRows.length;
		for (; t < n;) {
			let r = t + n >> 1;
			this.exceptionRows[r] < e ? t = r + 1 : n = r;
		}
		return t;
	}
	rowHeightOf(e) {
		if (this.exceptionRows.length === 0) return this.rowHeight;
		let t = this.exceptionsBefore(e);
		return this.exceptionRows[t] === e ? this.exceptionHeights[t] : this.rowHeight;
	}
	rowOffsetOf(e) {
		let t = H(e, 0, this.rowCount);
		return t * this.rowHeight + this.extraWithin(t);
	}
	get rowsHeight() {
		return this.rowCount * this.rowHeight + this.extraWithin(this.rowCount);
	}
	extraWithin(e) {
		let t = this.exceptionsBefore(e);
		if (t === 0) return 0;
		let n = t - 1;
		return this.exceptionStarts[n] + this.exceptionHeights[n] - (this.exceptionRows[n] + 1) * this.rowHeight;
	}
	widthOf(e) {
		return this.widths === void 0 ? this.uniformWidth : this.widths[e] ?? 0;
	}
	offsetOf(e) {
		if (this.widths === void 0) return e * this.uniformWidth;
		let t = H(e, 0, this.offsets.length - 1);
		return this.offsets[t] ?? 0;
	}
	get columnsWidth() {
		return this.widths === void 0 ? this.columnCount * this.uniformWidth : this.offsets[this.widths.length] ?? 0;
	}
	get contentWidth() {
		return this.gutterWidth + this.columnsWidth;
	}
	get frozenWidth() {
		return this.offsetOf(this.frozenColumns);
	}
	get contentHeight() {
		return this.headerHeight + this.rowsHeight;
	}
	cellAt(e, t) {
		return {
			row: this.rowAt(this.viewport.scrollY + t),
			column: this.columnAt(this.viewport.scrollX + e)
		};
	}
	rowAt(e) {
		let t = Math.max(0, this.rowCount - 1), n = e - this.headerHeight;
		if (this.exceptionRows.length === 0) return H(Math.floor(n / this.rowHeight), 0, t);
		if (n <= 0) return 0;
		let r = this.exceptionAt(n);
		if (r === -1) return H(Math.floor(n / this.rowHeight), 0, t);
		let i = this.exceptionStarts[r], a = this.exceptionHeights[r];
		return n < i + a ? H(this.exceptionRows[r], 0, t) : H(this.exceptionRows[r] + 1 + Math.floor((n - i - a) / this.rowHeight), 0, t);
	}
	columnAt(e) {
		let t = Math.max(0, this.columnCount - 1), n = e - this.gutterWidth;
		if (this.widths === void 0) return H(Math.floor(n / this.uniformWidth), 0, t);
		if (n <= 0) return 0;
		if (n >= this.columnsWidth) return t;
		let r = 0, i = t;
		for (; r < i;) {
			let e = r + i + 1 >> 1;
			this.offsets[e] <= n ? r = e : i = e - 1;
		}
		return r;
	}
	setRowCount(e) {
		e !== this.rowCount && (this.rowCount = Math.max(0, Math.floor(e)), this.invalidate());
	}
	setColumnCount(e) {
		e !== this.columnCount && (this.columnCount = Math.max(0, Math.floor(e)), this.invalidate());
	}
	setOverscan(e, t) {
		let n = Math.max(0, Math.floor(e)), r = Math.max(0, Math.floor(t));
		(n !== this.rowOverscan || r !== this.columnOverscan) && (this.rowOverscan = n, this.columnOverscan = r, this.invalidate());
	}
	setFrozen(e, t) {
		let n = Math.max(0, Math.floor(e)), r = Math.max(0, Math.floor(t));
		(n !== this.frozenRows || r !== this.frozenColumns) && (this.frozenRows = n, this.frozenColumns = r, this.invalidate());
	}
	invalidate() {
		this.mountedRows.clear(), this.frozenMounted.clear(), this.mountedHeader = void 0, this.range = _a, this.recompute();
	}
	update(e) {
		this.viewport = e, this.recompute();
	}
	recompute() {
		let e = this.windowFor(this.viewport);
		xa(e, this.range) || ((e.firstColumn !== this.range.firstColumn || e.lastColumn !== this.range.lastColumn) && (this.mountedRows.clear(), this.frozenMounted.clear(), this.mountedHeader = void 0), this.range = e, this.children$.next(this.buildChildren()), this.range$.next(e));
	}
	windowFor(e) {
		if (this.rowCount === 0 || this.columnCount === 0) return _a;
		let t = Math.max(this.frozenRows, this.rowAt(e.scrollY) - this.rowOverscan), n = Math.min(this.rowCount - 1, this.rowAt(e.scrollY + Math.max(0, e.height)) + this.rowOverscan), r = Math.max(this.frozenColumns, this.columnAt(e.scrollX) - this.columnOverscan), i = Math.min(this.columnCount - 1, this.columnAt(e.scrollX + Math.max(0, e.width)) + this.columnOverscan), a = {
			firstRow: t,
			lastRow: n,
			firstColumn: r,
			lastColumn: i
		};
		if (this.extendRange === void 0) return a;
		let o = this.extendRange(a);
		return {
			firstRow: H(Math.min(o.firstRow, t), this.frozenRows, t),
			lastRow: H(Math.max(o.lastRow, n), n, this.rowCount - 1),
			firstColumn: H(Math.min(o.firstColumn, r), this.frozenColumns, r),
			lastColumn: H(Math.max(o.lastColumn, i), i, this.columnCount - 1)
		};
	}
	buildChildren() {
		let { firstRow: e, lastRow: t, firstColumn: n, lastColumn: r } = this.range;
		if (t < e) return [];
		let i = this.contentWidth, a = this.offsetOf(n) - this.frozenWidth, o = [];
		this.renderHeader !== void 0 && (this.mountedHeader ??= this.wrapHeader(this.renderHeader(n, r), i, a), o.push(this.mountedHeader));
		for (let e = 0; e < this.frozenRows && e < this.rowCount; e++) {
			let t = this.frozenMounted.get(e);
			t === void 0 && (t = this.wrap(e, i, a), this.frozenMounted.set(e, t)), o.push(t);
		}
		o.push(ya("sheet:top", this.rowOffsetOf(e) - this.rowOffsetOf(this.frozenRows)));
		for (let n of this.mountedRows.keys()) (n < e || n > t) && this.mountedRows.delete(n);
		for (let n = e; n <= t; n++) {
			let e = this.mountedRows.get(n);
			e === void 0 && (e = this.wrap(n, i, a), this.mountedRows.set(n, e)), o.push(e);
		}
		return o.push(ya("sheet:bottom", this.rowsHeight - this.rowOffsetOf(t + 1))), o;
	}
	wrapHeader(e, t, n) {
		if (!ba(e)) throw Error("A sheet's header must be a Row element, laid out like the rows it labels.");
		return {
			...e,
			props: {
				...e.props,
				key: "sheet:header",
				width: t,
				height: this.headerHeight,
				flexShrink: 0
			},
			children: this.withLead(e.children, n)
		};
	}
	withLead(e, t) {
		let n = ya("sheet:lead", void 0, t), r = +(this.gutterWidth > 0) + this.frozenColumns;
		return r === 0 ? [n, ...e] : [
			...e.slice(0, r),
			n,
			...e.slice(r)
		];
	}
	wrap(e, t, n) {
		let r = this.renderRow(e, this.range.firstColumn, this.range.lastColumn);
		if (!ba(r)) throw Error(`A sheet row must be a Row element; row ${e} rendered something else. Its cells are laid out along one axis at widths the window already knows.`);
		return {
			...r,
			props: {
				...r.props,
				key: `sheet:row:${e}`,
				width: t,
				height: this.rowHeightOf(e),
				flexShrink: 0
			},
			children: this.withLead(r.children, n)
		};
	}
};
function ya(e, t, n) {
	return rn({
		key: e,
		height: t,
		width: n,
		flexShrink: 0
	});
}
function ba(e) {
	return typeof e == "object" && !!e && e.type === A.Row && Array.isArray(e.children);
}
function xa(e, t) {
	return e.firstRow === t.firstRow && e.lastRow === t.lastRow && e.firstColumn === t.firstColumn && e.lastColumn === t.lastColumn;
}
function H(e, t, n) {
	return Math.min(Math.max(e, t), n);
}
function Sa(e, t) {
	if (!(t > 0)) throw Error(`LazySheet ${e} must be positive, got ${String(t)}.`);
	return t;
}
Xt({
	name: "sheetSource",
	attach(e, t) {
		Ca(e, t.rowCount, (e) => t.sheet.setRowCount(e)), Ca(e, t.columnCount, (e) => t.sheet.setColumnCount(e));
		let n, r, i = () => {
			(n !== void 0 || r !== void 0) && t.sheet.setOverscan(n ?? 3, r ?? 2);
		};
		t.rowOverscan !== void 0 && Ca(e, t.rowOverscan, (e) => {
			n = e, i();
		}), t.columnOverscan !== void 0 && Ca(e, t.columnOverscan, (e) => {
			r = e, i();
		});
	}
});
function Ca(e, t, n) {
	if (!Se(t)) {
		n(t);
		return;
	}
	e.own(t.subscribe((t) => {
		n(t), e.requestFrame();
	}));
}
//#endregion
//#region packages/core/src/editing/TextBoundaries.ts
var wa = Ea("grapheme"), Ta = Ea("word");
function Ea(e) {
	let t = Intl;
	if (typeof t.Segmenter != "function") return null;
	try {
		return new t.Segmenter(void 0, { granularity: e });
	} catch {
		return null;
	}
}
function Da(e, t) {
	if (t >= e.length) return e.length;
	if (wa !== null) {
		let n = wa.segment(e).containing(t);
		if (n !== void 0) return n.index + n.segment.length;
	}
	let n = e.charCodeAt(t);
	return n >= 55296 && n <= 56319 && t + 1 < e.length ? t + 2 : t + 1;
}
function Oa(e, t) {
	if (t <= 0) return 0;
	if (wa !== null) {
		let n = wa.segment(e).containing(t - 1);
		if (n !== void 0) return n.index;
	}
	let n = e.charCodeAt(t - 1);
	return n >= 56320 && n <= 57343 && t - 2 >= 0 ? t - 2 : t - 1;
}
function ka(e) {
	let t = [0];
	if (wa !== null) {
		for (let n of wa.segment(e)) t.push(n.index + n.segment.length);
		return t;
	}
	let n = 0;
	for (; n < e.length;) n = Da(e, n), t.push(n);
	return t;
}
function Aa(e) {
	if (Ta === null) return [];
	let t = [0];
	for (let n of Ta.segment(e)) t.push(n.index + n.segment.length);
	return t;
}
function ja(e, t) {
	let n = e.length;
	if (t >= n) return n;
	if (e[t] === "\n") return t + 1;
	let r = t;
	for (; r < n && !za(e, r);) {
		if (e[r] === "\n") return r;
		r = Da(e, r);
	}
	return r >= n ? n : Ia(e, r);
}
function Ma(e, t) {
	if (t <= 0) return 0;
	if (e[t - 1] === "\n") return t - 1;
	let n = t;
	for (; n > 0 && !za(e, n - 1);) {
		if (e[n - 1] === "\n") return n;
		n = Oa(e, n);
	}
	return n <= 0 ? 0 : La(e, n - 1);
}
function Na(e, t) {
	if (e.length === 0) return {
		start: 0,
		end: 0
	};
	let n = Math.min(t, e.length - 1);
	if (e[n] === "\n") return {
		start: n,
		end: n
	};
	if (Ta !== null) {
		let t = Ta.segment(e).containing(n);
		if (t !== void 0) return {
			start: t.index,
			end: t.index + t.segment.length
		};
	}
	let r = za(e, n), i = n;
	for (; i > 0 && e[i - 1] !== "\n" && za(e, i - 1) === r;) i = Oa(e, i);
	let a = n;
	for (; a < e.length && e[a] !== "\n" && za(e, a) === r;) a = Da(e, a);
	return {
		start: i,
		end: a
	};
}
function Pa(e, t) {
	let n = e.lastIndexOf("\n", Math.max(0, t - 1));
	return n < 0 ? 0 : n + 1;
}
function Fa(e, t) {
	let n = e.indexOf("\n", t);
	return n < 0 ? e.length : n;
}
function Ia(e, t) {
	if (Ta !== null) {
		let n = Ta.segment(e).containing(t);
		if (n !== void 0 && n.isWordLike) return n.index + n.segment.length;
	}
	let n = t;
	for (; n < e.length && za(e, n);) n = Da(e, n);
	return n;
}
function La(e, t) {
	if (Ta !== null) {
		let n = Ta.segment(e).containing(t);
		if (n !== void 0 && n.isWordLike) return n.index;
	}
	let n = t;
	for (; n > 0 && za(e, n - 1);) n = Oa(e, n);
	return n;
}
var Ra = /[\p{L}\p{N}_]/u;
function za(e, t) {
	if (Ta !== null) return Ta.segment(e).containing(t)?.isWordLike === !0;
	let n = e.charCodeAt(t), r = n >= 55296 && n <= 56319 && t + 1 < e.length ? e.slice(t, t + 2) : e[t];
	return Ra.test(r);
}
//#endregion
//#region packages/core/src/editing/EditableTextModel.ts
var Ba = 500, Va = class {
	textValue = "";
	anchorValue = 0;
	focusValue = 0;
	compositionValue = null;
	compositionBase = null;
	undoStack = [];
	redoStack = [];
	lastEdit = "other";
	lastEditEnd = -1;
	focused = !1;
	version = 0;
	blinkOrigin = 0;
	syncedValue = void 0;
	constructor(e = "") {
		this.textValue = e;
	}
	get text() {
		return this.textValue;
	}
	get anchor() {
		return this.anchorValue;
	}
	get focus() {
		return this.focusValue;
	}
	get start() {
		return Math.min(this.anchorValue, this.focusValue);
	}
	get end() {
		return Math.max(this.anchorValue, this.focusValue);
	}
	get collapsed() {
		return this.anchorValue === this.focusValue;
	}
	get selectedText() {
		return this.textValue.slice(this.start, this.end);
	}
	get composition() {
		return this.compositionValue;
	}
	get composing() {
		return this.compositionValue !== null;
	}
	get canUndo() {
		return this.undoStack.length > 0;
	}
	get canRedo() {
		return this.redoStack.length > 0;
	}
	select(e, t = e) {
		let n = this.clampOffset(e), r = this.clampOffset(t);
		(n !== this.anchorValue || r !== this.focusValue) && (this.anchorValue = n, this.focusValue = r, this.lastEdit = "other", this.touch());
	}
	moveTo(e, t) {
		this.select(t ? this.anchorValue : e, e);
	}
	selectAll() {
		this.select(0, this.textValue.length);
	}
	move(e, t, n) {
		if (!n && !this.collapsed && e === "grapheme") {
			this.select(t < 0 ? this.start : this.end);
			return;
		}
		this.moveTo(this.offsetBy(this.focusValue, e, t), n);
	}
	offsetBy(e, t, n) {
		let r = this.textValue;
		switch (t) {
			case "grapheme": return n < 0 ? Oa(r, e) : Da(r, e);
			case "word": return n < 0 ? Ma(r, e) : ja(r, e);
			case "line": return n < 0 ? Pa(r, e) : Fa(r, e);
			case "document": return n < 0 ? 0 : r.length;
		}
	}
	insertText(e) {
		let t = this.start, n = this.end, r = this.collapsed && e.length > 0 && e === e.slice(0, Da(e, 0)) && this.lastEdit === "insert" && this.lastEditEnd === t;
		this.edit(t, n, e, r, "insert");
	}
	deleteBackward(e = "grapheme") {
		if (!this.collapsed) {
			this.edit(this.start, this.end, "", !1, "other");
			return;
		}
		let t = this.focusValue;
		if (t === 0) return;
		let n = this.offsetBy(t, e, -1);
		n === t && (n = Oa(this.textValue, t));
		let r = e === "grapheme" && this.lastEdit === "delete" && this.lastEditEnd === t;
		this.edit(n, t, "", r, "delete");
	}
	deleteForward(e = "grapheme") {
		if (!this.collapsed) {
			this.edit(this.start, this.end, "", !1, "other");
			return;
		}
		let t = this.focusValue;
		if (t >= this.textValue.length) return;
		let n = this.offsetBy(t, e, 1);
		n === t && (n = Da(this.textValue, t)), this.edit(t, n, "", !1, "other");
	}
	replaceRange(e, t, n) {
		let r = this.clampOffset(Math.min(e, t)), i = this.clampOffset(Math.max(e, t));
		this.edit(r, i, n, !1, "other");
	}
	replaceText(e) {
		e !== this.textValue && (this.textValue = e, this.anchorValue = this.clampOffset(this.anchorValue), this.focusValue = this.clampOffset(this.focusValue), this.compositionValue = null, this.compositionBase = null, this.undoStack = [], this.redoStack = [], this.lastEdit = "other", this.touch());
	}
	beginComposition() {
		if (this.compositionValue !== null) return;
		this.compositionBase = this.snapshot();
		let e = this.start, t = this.end;
		e !== t && (this.textValue = this.textValue.slice(0, e) + this.textValue.slice(t)), this.anchorValue = e, this.focusValue = e, this.compositionValue = {
			start: e,
			end: e
		}, this.touch();
	}
	updateComposition(e, t = e.length) {
		this.compositionValue === null && this.beginComposition();
		let n = this.compositionValue;
		this.textValue = this.textValue.slice(0, n.start) + e + this.textValue.slice(n.end);
		let r = n.start + e.length;
		this.compositionValue = {
			start: n.start,
			end: r
		};
		let i = n.start + Math.max(0, Math.min(t, e.length));
		this.anchorValue = i, this.focusValue = i, this.touch();
	}
	commitComposition(e) {
		if (this.compositionValue === null) {
			this.insertText(e), this.lastEdit = "other";
			return;
		}
		let t = this.compositionValue, n = this.compositionBase;
		this.textValue = this.textValue.slice(0, t.start) + e + this.textValue.slice(t.end);
		let r = t.start + e.length;
		this.anchorValue = r, this.focusValue = r, this.compositionValue = null, this.compositionBase = null, n !== null && n.text !== this.textValue && this.pushUndo(n), this.lastEdit = "other", this.touch();
	}
	cancelComposition() {
		if (this.compositionValue === null) return;
		let e = this.compositionBase;
		this.textValue = e.text, this.anchorValue = e.anchor, this.focusValue = e.focus, this.compositionValue = null, this.compositionBase = null, this.touch();
	}
	undo() {
		let e = this.undoStack.pop();
		return e !== void 0 && (this.redoStack.push(this.snapshot()), this.restore(e), !0);
	}
	redo() {
		let e = this.redoStack.pop();
		return e !== void 0 && (this.undoStack.push(this.snapshot()), this.restore(e), !0);
	}
	breakUndoGroup() {
		this.lastEdit = "other";
	}
	edit(e, t, n, r, i) {
		if (this.compositionValue !== null && this.commitComposition(this.textValue.slice(this.compositionValue.start, this.compositionValue.end)), e === t && n.length === 0) return;
		r || this.pushUndo(this.snapshot()), this.redoStack = [], this.textValue = this.textValue.slice(0, e) + n + this.textValue.slice(t);
		let a = e + n.length;
		this.anchorValue = a, this.focusValue = a, this.lastEdit = i, this.lastEditEnd = a, this.touch();
	}
	pushUndo(e) {
		this.undoStack.push(e), this.undoStack.length > Ba && this.undoStack.shift();
	}
	restore(e) {
		this.textValue = e.text, this.anchorValue = this.clampOffset(e.anchor), this.focusValue = this.clampOffset(e.focus), this.compositionValue = null, this.compositionBase = null, this.lastEdit = "other", this.touch();
	}
	snapshot() {
		return {
			text: this.textValue,
			anchor: this.anchorValue,
			focus: this.focusValue
		};
	}
	clampOffset(e) {
		return Math.max(0, Math.min(this.textValue.length, Math.floor(e)));
	}
	touch() {
		this.version++;
	}
};
//#endregion
//#region packages/core/src/editing/TextGeometry.ts
function Ha(e, t) {
	let n = 0;
	for (let r = 1; r < e.length && e[r].start <= t; r++) n = r;
	return n;
}
function Ua(e, t, n) {
	if (t >= e.length - 1) return n.length;
	let r = e[t + 1].start;
	return r > 0 && n[r - 1] === "\n" ? r - 1 : r;
}
function Wa(e, t, n, r) {
	let i = Math.max(0, t - e.start);
	return i === 0 ? 0 : i === e.text.length ? e.width : r(i < e.text.length ? e.text.slice(0, i) : n.slice(e.start, t), e.start);
}
function Ga(e, t, n, r, i) {
	let a = Ha(e, n), o = e[a], s = Wa(o, Math.min(n, Ua(e, a, t)), t, r);
	return {
		x: i ? o.x + o.width - s : o.x + s,
		y: o.y,
		height: o.height,
		line: a
	};
}
function Ka(e, t) {
	if (t < e[0].y) return 0;
	for (let n = 0; n < e.length; n++) if (t < e[n].y + e[n].height) return n;
	return e.length - 1;
}
function qa(e, t, n, r, i, a) {
	return Ja(e, Ka(e, r), t, n, i, a);
}
function Ja(e, t, n, r, i, a) {
	let o = e[t], s = t === e.length - 1 ? n.slice(o.start, Ua(e, t, n)) : o.text, c = s.length === o.text.length ? o.width : i(s, o.start), l = a ? o.x + o.width - r : r - o.x;
	if (l <= 0) return o.start;
	if (l >= c) return o.start + s.length;
	let u = ka(s), d = (e) => e === 0 ? 0 : i(s.slice(0, u[e]), o.start), f = 0, p = u.length - 1;
	for (; f < p;) {
		let e = f + p >> 1;
		d(e) < l ? f = e + 1 : p = e;
	}
	if (f > 0) {
		let e = d(f - 1), t = d(f);
		l - e < t - l && f--;
	}
	return o.start + u[f];
}
function Ya(e, t, n, r, i, a, o) {
	let s = Ga(e, t, n, i, a), c = s.line + r;
	if (c < 0 || c >= e.length) return null;
	let l = o ?? s.x;
	return {
		offset: Ja(e, c, t, l, i, a),
		x: l
	};
}
function Xa(e, t, n, r, i, a) {
	if (r <= n) return [];
	let o = [], s = Ha(e, n), c = Ha(e, Math.max(n, r - 1));
	for (let l = s; l <= c; l++) {
		let s = e[l], c = Ua(e, l, t), u = Wa(s, Math.max(s.start, Math.min(n, c)), t, i), d = Wa(s, Math.min(r, c), t, i);
		r > c && l < e.length - 1 && c === s.end && (d += i(" ")), !(d <= u) && o.push({
			x: a ? s.x + s.width - d : s.x + u,
			y: s.y,
			width: d - u,
			height: s.height
		});
	}
	return o;
}
//#endregion
//#region packages/core/src/properties/UiThemeShape.ts
function Za(e, t) {
	let n = (e.environment === null ? P.theme.defaultValue : e.environment.get(P.theme)).shapes;
	return Object.prototype.hasOwnProperty.call(n, t) ? n[t] : void 0;
}
function Qa(e, t) {
	if (typeof t == "string") {
		let n = Za(e, t);
		return n === void 0 ? jr(void 0) : Dr(Math.max(0, n));
	}
	return jr(t);
}
//#endregion
//#region packages/core/src/properties/UiVideo.ts
function $a(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return typeof t.version == "number" && typeof t.width == "number" && typeof t.height == "number" && "frame" in t;
}
function eo(e) {
	let t = e.frame;
	if (t === null) return {
		width: e.width,
		height: e.height
	};
	if (typeof t.displayWidth == "number") {
		let e = t;
		return {
			width: e.displayWidth,
			height: e.displayHeight
		};
	}
	let n = t;
	return {
		width: n.width,
		height: n.height
	};
}
//#endregion
//#region packages/core/src/properties/UiThemeColor.ts
function to(e, t) {
	let n = (e.environment === null ? P.theme.defaultValue : e.environment.get(P.theme)).colors;
	return Object.prototype.hasOwnProperty.call(n, t) ? n[t] : void 0;
}
function no(e, t) {
	return ro(e, V(e, t));
}
function ro(e, t) {
	if (typeof t == "string") {
		let n = to(e, t);
		if (n !== void 0) return n;
	}
	return zn(t);
}
function io(e, t) {
	if (t === void 0) return;
	let n = Br(t);
	if (n !== void 0) throw Error(n);
	let r = [];
	for (let n of t.stops) {
		let t = ro(e, n.color);
		if (t === void 0) return;
		r.push({
			offset: n.offset,
			color: t
		});
	}
	return t.kind === "linear" ? {
		kind: "linear",
		angle: t.angle,
		stops: r
	} : {
		kind: "radial",
		centerX: t.centerX,
		centerY: t.centerY,
		radius: t.radius,
		stops: r
	};
}
function ao(e, t) {
	return to(e, t);
}
//#endregion
//#region packages/core/src/editing/UiEditable.ts
var oo = "editor";
function U(e) {
	let t = e.properties.get(oo);
	return t instanceof Va || (t = new Va(), e.properties.set(oo, t)), so(e, t), t;
}
function so(e, t) {
	let n = e.properties.get("value"), r = typeof n == "string" ? n : n == null ? void 0 : String(n);
	r !== t.syncedValue && (t.syncedValue = r, t.replaceText(r ?? ""));
}
function co(e) {
	return e.type === A.EditableText;
}
function lo(e) {
	return e.properties.get("multiline") === !0;
}
function uo(e) {
	return e.properties.get("readOnly") === !0;
}
function fo(e, t) {
	if (e.composing) return !0;
	let n = Math.max(0, t - e.blinkOrigin);
	return Math.floor(n / 530) % 2 == 0;
}
function po(e, t) {
	let n = Math.max(0, t - e.blinkOrigin);
	return e.blinkOrigin + (Math.floor(n / 530) + 1) * 530;
}
//#endregion
//#region packages/core/src/selection/UiTextLinks.ts
var mo = "textLinkHover";
function ho(e) {
	let t = e.properties.get(mo);
	return typeof t == "number" ? t : -1;
}
function go(e, t) {
	return ho(e) !== t && (t < 0 ? e.properties.delete(mo) : e.properties.set(mo, t), !0);
}
function _o(e) {
	return go(e, -1);
}
function vo(e) {
	for (let t of Yn(e)) if (t.link !== void 0) return !0;
	return !1;
}
function yo(e, t) {
	let n = Yn(e);
	return t >= 0 && t < n.length ? n[t].link : void 0;
}
function bo(e, t, n) {
	for (let r of e.lines) if (!(r.runs === void 0 || n < r.y || n >= r.y + r.height)) {
		for (let e of r.runs) if (e.span >= 0 && t >= e.x && t < e.x + e.width) return e.span;
		return -1;
	}
	return -1;
}
//#endregion
//#region packages/core/src/input/UiInteraction.ts
function xo(e) {
	if (e.properties.get("disabled") === !0 || e.properties.get("pointerEvents") === "none" || e.properties.get("visible") === !1) return !0;
	let t = e.properties.get("opacity");
	return !!(typeof t == "number" && Number.isFinite(t) && t <= 0);
}
function So(e) {
	return e.properties.get("hitTestable") !== !1;
}
function Co(e) {
	if (xo(e) || e.type === A.Root) return !1;
	let t = e.properties.get("focusable");
	return t === !0 ? !0 : t === !1 ? !1 : e.type === A.Button || e.type === A.EditableText;
}
function wo(e) {
	for (let t = e; t !== null; t = t.parent) {
		let e = t.properties.get("selectable");
		if (e === !0) return !0;
		if (e === !1 || t.type === A.Button) return !1;
	}
	return !0;
}
function To(e) {
	if (e !== null && ho(e) >= 0) return "pointer";
	for (let t = e; t !== null; t = t.parent) {
		let e = t.properties.get("cursor");
		if (typeof e == "string" && e.length > 0) return e;
		if (t.type === A.EditableText) return "text";
	}
	return null;
}
//#endregion
//#region packages/core/src/selection/UiSelectable.ts
var Eo = "textSelection";
function Do(e) {
	let t = e.properties.get(Eo);
	if (typeof t != "object" || !t) return;
	let n = t;
	return typeof n.start == "number" && typeof n.end == "number" ? t : void 0;
}
function Oo(e, t, n) {
	let r = Do(e);
	return r !== void 0 && r.start === t && r.end === n ? !1 : (e.properties.set(Eo, {
		start: t,
		end: n
	}), !0);
}
function ko(e) {
	return e.properties.delete(Eo);
}
function Ao(e) {
	if (e.type !== A.Text || !wo(e) || jo(e)) return;
	let t = Jn(e);
	return t.length > 0 ? t : void 0;
}
function jo(e) {
	for (let t = e; t !== null; t = t.parent) if (xo(t)) return !0;
	return !1;
}
function Mo(e) {
	let t = [];
	return No(e, t), t;
}
function No(e, t) {
	if (!xo(e)) {
		if (Ao(e) !== void 0) {
			t.push(e);
			return;
		}
		for (let n = e.firstChild; n !== null; n = n.nextSibling) No(n, t);
	}
}
//#endregion
//#region packages/core/src/find/UiTextMatches.ts
var Po = "textMatches";
function Fo(e) {
	let t = e.properties.get(Po);
	return Array.isArray(t) && t.length > 0 ? t : void 0;
}
function Io(e, t) {
	let n = Fo(e);
	return n !== void 0 && Ro(n, t) ? !1 : t.length === 0 ? Lo(e) : (e.properties.set(Po, t), !0);
}
function Lo(e) {
	return e.properties.delete(Po);
}
function Ro(e, t) {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n].start !== t[n].start || e[n].end !== t[n].end) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/properties/UiTextFont.ts
var zo = 1.2;
function Bo(e) {
	let t = {
		fontSize: 0,
		fontFamily: "",
		fontWeight: "normal",
		lineHeight: 0,
		letterSpacing: 0,
		fontStyle: "normal",
		fontStretch: "normal",
		fontVariant: "normal",
		fontKerning: "auto"
	};
	return Vo(e, t), t;
}
function Vo(e, t) {
	let n = Ho(V(e, B.fontSize)) ?? B.fontSize.defaultValue, r = e.properties.get("fontSize"), i = Ho(e.properties.get("lineHeight"));
	t.lineHeight = i === void 0 ? r === void 0 ? Ho(V(e, B.lineHeight)) ?? n * 1.2 : n * zo : i, t.fontSize = n, t.fontFamily = Go(V(e, B.fontFamily)) ?? B.fontFamily.defaultValue, t.fontWeight = Wo(V(e, B.fontWeight)) ?? B.fontWeight.defaultValue, t.letterSpacing = Uo(V(e, B.letterSpacing)) ?? 0, t.fontStyle = Go(V(e, B.fontStyle)) ?? "normal", t.fontStretch = Go(V(e, B.fontStretch)) ?? "normal", t.fontVariant = Go(V(e, B.fontVariant)) ?? "normal", t.fontKerning = Go(e.properties.get("fontKerning")) ?? "auto";
}
function Ho(e) {
	return typeof e == "number" && Number.isFinite(e) && e > 0 ? e : void 0;
}
function Uo(e) {
	return typeof e == "number" && Number.isFinite(e) ? e : void 0;
}
function Wo(e) {
	return typeof e == "number" ? Uo(e) : Go(e);
}
function Go(e) {
	return typeof e == "string" && e.length > 0 ? e : void 0;
}
var Ko = "sans-serif", qo = "normal", Jo = Cn.black;
function Yo(e) {
	switch (e) {
		case "center":
		case "right":
		case "left":
		case "end": return e;
		default: return "start";
	}
}
function Xo(e) {
	return e === "none" || e === "nowrap" ? "none" : e === "char" ? "char" : "word";
}
function Zo(e) {
	return e === "ellipsis" ? "ellipsis" : "clip";
}
function Qo(e) {
	return e === "middle" || e === "center" ? "middle" : e === "bottom" || e === "end" ? "bottom" : "top";
}
function $o(e, t) {
	t.visible = Ii(e, "visible") ?? !0;
	let n = Pi(e, "opacity");
	t.opacity = n === void 0 ? 1 : Math.min(Math.max(n, 0), 1), t.backgroundColor = no(e, B.backgroundColor), t.backgroundGradient = io(e, V(e, B.backgroundGradient)), t.borderColor = no(e, B.borderColor), t.borderWidth = Pi(e, "borderWidth") ?? 0, t.borderRadius = Qa(e, V(e, B.borderRadius)), t.boxShadows = V(e, B.boxShadows), t.image = os(e.properties.get("image")), t.video = as(e.properties.get("video")), t.objectFit = ss(e.properties.get("objectFit"));
	let r = e.properties.get("transform"), i = r === void 0 ? void 0 : Zr(r);
	if (i === void 0 ? t.hasTransform = !1 : (t.hasTransform = !0, t.transform = i), co(e)) {
		let n = U(e);
		t.editor = n, t.text = n.text, t.placeholder = Fi(e, "placeholder"), t.placeholderColor = no(e, B.placeholderColor) ?? ao(e, "textMuted") ?? ls, t.selectionColor = no(e, B.selectionColor) ?? fs(e), t.caretColor = no(e, B.caretColor) ?? no(e, B.color) ?? Cn.black, t.textSelection = void 0, t.textMatches = void 0;
	} else t.editor = void 0, Yn(e).length > 0 ? t.text = Jn(e) : (t.text = Fi(e, "text"), t.text === void 0 && hs(e)), t.placeholder = void 0, t.textSelection = t.text === void 0 ? void 0 : Do(e), t.textSelection !== void 0 && (t.selectionColor = no(e, B.selectionColor) ?? fs(e)), t.textMatches = t.text === void 0 ? void 0 : Fo(e), t.textMatches !== void 0 && (t.matchColor = no(e, B.matchColor) ?? ps(e));
	if (t.text === void 0) return es(t), t;
	t.rtl = V(e, B.textDirection) === "rtl", Vo(e, t), t.spans = t.editor === void 0 ? ns(e) : void 0, t.linkHover = t.spans === void 0 ? -1 : ho(e), t.textDecoration = V(e, B.textDecoration), t.textColor = no(e, B.color) ?? Cn.black, t.textAlign = Yo(V(e, B.textAlign)), t.verticalAlign = Qo(Fi(e, "verticalAlign")), t.textWrap = Xo(Fi(e, "textWrap"));
	let a = Pi(e, "maxLines");
	return t.maxLines = a !== void 0 && a >= 1 ? Math.floor(a) : void 0, t.textOverflow = Zo(Fi(e, "textOverflow")), t;
}
function es(e) {
	e.fontSize = 14, e.fontFamily = Ko, e.fontWeight = qo, e.lineHeight = 0, e.letterSpacing = 0, e.textColor = Jo, e.textAlign = "start", e.verticalAlign = "top", e.textWrap = "word", e.maxLines = void 0, e.textOverflow = "clip", e.rtl = !1, e.fontStyle = "normal", e.fontStretch = "normal", e.fontVariant = "normal", e.fontKerning = "auto", e.textDecoration = "none", e.spans = void 0, e.linkHover = -1;
}
var ts = /* @__PURE__ */ new WeakMap();
function ns(e) {
	let t = Yn(e);
	if (t.length === 0) return;
	let n = e.environment === null ? void 0 : e.environment.get(P.theme), r = ts.get(t);
	if (r !== void 0 && r.theme === n) return r.spans;
	let i = t.map((t) => ({
		start: t.start,
		end: t.end,
		fontFamily: t.fontFamily,
		fontSize: t.fontSize,
		fontWeight: t.fontWeight,
		fontStyle: t.fontStyle,
		fontStretch: t.fontStretch,
		fontVariant: t.fontVariant,
		fontKerning: t.fontKerning,
		letterSpacing: t.letterSpacing,
		color: ro(e, t.color),
		backgroundColor: ro(e, t.backgroundColor),
		textDecoration: t.textDecoration,
		link: t.link
	}));
	return ts.set(t, {
		theme: n,
		spans: i
	}), i;
}
function rs(e) {
	if (Ii(e, "visible") === !1) return !1;
	let t = Pi(e, "opacity");
	return !(t !== void 0 && t <= 0);
}
function is(e, t, n, r) {
	if (t <= 0 || n <= 0) return {
		x: r.x,
		y: r.y,
		width: 0,
		height: 0
	};
	switch (e) {
		case "cover": {
			let e = Math.max(r.width / t, r.height / n), i = t * e, a = n * e;
			return {
				x: r.x + (r.width - i) / 2,
				y: r.y + (r.height - a) / 2,
				width: i,
				height: a
			};
		}
		case "contain": {
			let e = Math.min(r.width / t, r.height / n), i = t * e, a = n * e;
			return {
				x: r.x + (r.width - i) / 2,
				y: r.y + (r.height - a) / 2,
				width: i,
				height: a
			};
		}
		case "none": return {
			x: r.x,
			y: r.y,
			width: t,
			height: n
		};
		default: return {
			x: r.x,
			y: r.y,
			width: r.width,
			height: r.height
		};
	}
}
function as(e) {
	return $a(e) ? e : void 0;
}
function os(e) {
	if (typeof e != "object" || !e) return;
	let t = e;
	if (typeof t.width == "number" && typeof t.height == "number") return e;
}
function ss(e) {
	return e === "cover" || e === "contain" || e === "none" ? e : "fill";
}
function cs() {
	return {
		visible: !0,
		opacity: 1,
		backgroundColor: void 0,
		backgroundGradient: void 0,
		image: void 0,
		video: void 0,
		objectFit: "fill",
		borderColor: void 0,
		borderWidth: 0,
		borderRadius: {
			topLeft: 0,
			topRight: 0,
			bottomRight: 0,
			bottomLeft: 0
		},
		boxShadows: [],
		hasTransform: !1,
		transform: {
			x: 0,
			y: 0,
			translateX: 0,
			translateY: 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0
		},
		text: void 0,
		spans: void 0,
		linkHover: -1,
		fontSize: 14,
		fontFamily: Ko,
		fontWeight: qo,
		lineHeight: 0,
		letterSpacing: 0,
		fontStyle: "normal",
		fontStretch: "normal",
		fontVariant: "normal",
		fontKerning: "auto",
		textDecoration: "none",
		textColor: Jo,
		textAlign: "start",
		verticalAlign: "top",
		textWrap: "word",
		maxLines: void 0,
		textOverflow: "clip",
		rtl: !1,
		editor: void 0,
		textSelection: void 0,
		textMatches: void 0,
		placeholder: void 0,
		placeholderColor: ls,
		selectionColor: us,
		matchColor: ds,
		caretColor: Jo
	};
}
var ls = {
	r: .4,
	g: .4,
	b: .4,
	a: 1
}, us = {
	r: .13,
	g: .59,
	b: .95,
	a: .35
}, ds = {
	r: .61,
	g: .15,
	b: .69,
	a: .3
};
function fs(e) {
	let t = ao(e, "primary");
	return t === void 0 ? us : {
		r: t.r,
		g: t.g,
		b: t.b,
		a: .35
	};
}
function ps(e) {
	let t = ao(e, "secondary");
	return t === void 0 ? ds : {
		r: t.r,
		g: t.g,
		b: t.b,
		a: .3
	};
}
function W(e) {
	return e.a === 1 ? Dn(e) : kn(e);
}
var ms = /* @__PURE__ */ new WeakSet();
function hs(e) {
	let t = V(e, B.text);
	if (t == null || typeof t == "string" || ms.has(e)) return;
	ms.add(e);
	let n = Array.isArray(t) ? "an array" : typeof t == "object" ? "an element or object" : typeof t;
	console.warn(`Node '${e.id}' has a text that is ${n}, and nothing is drawn for it. A lone Observable child of <text> or <button> is read as its text; if it was meant as children, put it in an array (\`{[child$]}\`) or wrap it in a <box>.`);
}
//#endregion
//#region packages/core/src/rendering/FontStacks.ts
var gs = /* @__PURE__ */ new Map();
function _s(e, t) {
	let n = [e, ...t].map(bs);
	gs.set(e, {
		families: n,
		generation: 0,
		list: n.join(", ")
	});
}
function vs(e) {
	return gs.get(e)?.list ?? e;
}
function ys(e) {
	let t = gs.get(e);
	t !== void 0 && (t.generation++, t.list = [...t.families, `gesso-reload-${t.generation}`].join(", "));
}
function bs(e) {
	let t = e.trim();
	return /^["']/.test(t) || /^[a-zA-Z_-][\w-]*$/.test(t) ? t : `"${t.replace(/"/g, "\\\"")}"`;
}
//#endregion
//#region packages/core/src/rendering/TextRenderer.ts
var xs = .12, Ss = {
	font: "",
	letterSpacing: 0,
	fontStretch: "normal",
	fontKerning: "auto"
};
function Cs(e, t, n) {
	let r = t.text;
	return r === void 0 || r.length === 0 || t.fontSize <= 0 ? [] : Ts(e, t, n.layout(ws(r, t, e)));
}
function ws(e, t, n) {
	return {
		text: e,
		fontSize: t.fontSize,
		fontFamily: t.fontFamily,
		fontWeight: t.fontWeight,
		lineHeight: t.lineHeight > 0 ? t.lineHeight : void 0,
		letterSpacing: t.letterSpacing,
		fontStyle: t.fontStyle,
		fontStretch: t.fontStretch,
		fontVariant: t.fontVariant,
		fontKerning: t.fontKerning,
		maxWidth: n.width > 0 ? n.width : void 0,
		wrap: t.textWrap,
		maxLines: t.maxLines,
		overflow: t.textOverflow,
		spans: t.spans
	};
}
function Ts(e, t, n) {
	let r = Bs(t.verticalAlign, e.height, n.height), i = [];
	for (let a = 0; a < n.lines.length; a++) {
		let o = n.lines[a], s = zs(t.textAlign, t.rtl, e.x, e.width, o.width), c = e.y + r + a * n.lineHeight, l;
		if (o.runs !== void 0) {
			l = [];
			for (let e of o.runs) l.push({
				span: e.span,
				start: e.start,
				end: e.end,
				text: e.text,
				x: t.rtl ? s + o.width - e.x - e.width : s + e.x,
				width: e.width
			});
		}
		i.push({
			text: o.text,
			start: o.start,
			end: o.end,
			x: s,
			y: c,
			baselineY: c + n.firstBaseline,
			width: o.width,
			height: n.lineHeight,
			runs: l
		});
	}
	return i;
}
function Es(e) {
	return `${e.fontStyle !== void 0 && e.fontStyle !== "normal" ? `${e.fontStyle} ` : ""}${e.fontVariant !== void 0 && e.fontVariant !== "normal" ? `${e.fontVariant} ` : ""}${String(e.fontWeight)} ${e.fontSize}px ${vs(e.fontFamily)}`;
}
function Ds(e, t) {
	return Es({
		fontWeight: t?.fontWeight ?? e.fontWeight ?? "normal",
		fontSize: t?.fontSize ?? e.fontSize ?? 0,
		fontFamily: t?.fontFamily ?? e.fontFamily ?? "sans-serif",
		fontStyle: t?.fontStyle ?? e.fontStyle,
		fontVariant: t?.fontVariant ?? e.fontVariant
	});
}
function Os() {
	return {
		font: "",
		letterSpacing: 0,
		fontStretch: "normal",
		fontKerning: "auto"
	};
}
function ks(e, t, n) {
	return n.font = Ds(e, t), n.letterSpacing = t?.letterSpacing ?? e.letterSpacing ?? 0, n.fontStretch = t?.fontStretch ?? e.fontStretch ?? "normal", n.fontKerning = t?.fontKerning ?? e.fontKerning ?? "auto", `${n.font}\0${n.letterSpacing}\0${n.fontStretch}\0${n.fontKerning}`;
}
function As(e, t) {
	e.font = t.font;
	let n = e;
	n.letterSpacing = `${t.letterSpacing}px`, n.fontStretch = t.fontStretch, n.fontKerning = t.fontKerning;
}
function js(e, t, n, r) {
	let i = Cs(t, n, r);
	Ns(e, Ps(i, n)), Ms(e, i, Es(n), W(n.textColor), n.letterSpacing, n.rtl, n), Ns(e, Fs(i, n));
}
function Ms(e, t, n, r, i = 0, a = !1, o) {
	if (t.length !== 0) {
		e.direction = a ? "rtl" : "ltr", e.textAlign = "left", e.textBaseline = "alphabetic", Ss.font = n, Ss.letterSpacing = i, Ss.fontStretch = o?.fontStretch ?? "normal", Ss.fontKerning = o?.fontKerning ?? "auto", As(e, Ss), e.fillStyle = r;
		for (let n of t) {
			if (n.runs !== void 0 && o !== void 0) {
				for (let t of n.runs) {
					if (t.text.length === 0) continue;
					let r = Rs(o, t.span);
					ks(o, r, Ss), As(e, Ss), e.fillStyle = W(r?.color ?? o.textColor), e.fillText(t.text, t.x, n.baselineY);
				}
				continue;
			}
			n.text.length > 0 && e.fillText(n.text, n.x, n.baselineY);
		}
	}
}
function Ns(e, t) {
	for (let n of t) e.fillStyle = W(n.color), e.fillRect(n.x, n.y, n.width, n.height);
}
function Ps(e, t) {
	if (t.spans === void 0) return Is;
	let n = [];
	for (let r of e) if (r.runs !== void 0) for (let e of r.runs) {
		let i = Rs(t, e.span);
		if (i !== void 0 && (i.backgroundColor !== void 0 && n.push({
			x: e.x,
			y: r.y,
			width: e.width,
			height: r.height,
			color: i.backgroundColor
		}), e.span === t.linkHover && i.link !== void 0)) {
			let a = i.color ?? t.textColor;
			n.push({
				x: e.x,
				y: r.y,
				width: e.width,
				height: r.height,
				color: {
					r: a.r,
					g: a.g,
					b: a.b,
					a: a.a * xs
				}
			});
		}
	}
	return n;
}
function Fs(e, t) {
	let n = t.textDecoration ?? "none";
	if (n === "none" && t.spans === void 0) return Is;
	let r = [];
	for (let i of e) {
		if (i.runs === void 0) {
			n !== "none" && i.text.length > 0 && Ls(r, n, i.x, i.width, i.baselineY, t.fontSize, t.textColor);
			continue;
		}
		for (let e of i.runs) {
			if (e.text.length === 0) continue;
			let a = Rs(t, e.span), o = e.span === t.linkHover && a?.link !== void 0, s = a?.textDecoration ?? n;
			o && s !== "underline line-through" && (s = s === "line-through" ? "underline line-through" : "underline"), s !== "none" && Ls(r, s, e.x, e.width, i.baselineY, a?.fontSize ?? t.fontSize, a?.color ?? t.textColor);
		}
	}
	return r;
}
var Is = [];
function Ls(e, t, n, r, i, a, o) {
	let s = Math.max(1, Math.round(a / 14));
	t.includes("underline") && e.push({
		x: n,
		y: Math.round(i + Math.max(1, a * .08)),
		width: r,
		height: s,
		color: o
	}), t.includes("line-through") && e.push({
		x: n,
		y: Math.round(i - a * .28),
		width: r,
		height: s,
		color: o
	});
}
function Rs(e, t) {
	return t < 0 || e.spans === void 0 ? void 0 : e.spans[t];
}
function zs(e, t, n, r, i) {
	switch (e) {
		case "center": return n + (r - i) / 2;
		case "right": return n + r - i;
		case "left": return n;
		case "end": return t ? n : n + r - i;
		default: return t ? n + r - i : n;
	}
}
function Bs(e, t, n) {
	switch (e) {
		case "middle": return (t - n) / 2;
		case "bottom": return t - n;
		default: return 0;
	}
}
//#endregion
//#region packages/core/src/editing/EditableLayout.ts
var Vs = class {
	model;
	box;
	lines;
	placeholderLines;
	measure;
	rtl;
	constructor(e, t, n, r) {
		this.model = e, this.box = t;
		let i = ws(e.text, n, t);
		i.maxLines = void 0, i.overflow = "clip", this.lines = Ts(t, n, r.layout(i)), this.measure = (e) => e.length === 0 ? 0 : r.measureRunWidth(e, i), this.rtl = n.rtl, this.placeholderLines = e.text.length === 0 && n.placeholder !== void 0 && n.placeholder.length > 0 ? Ts(t, n, r.layout({
			...i,
			text: n.placeholder
		})) : [];
	}
	caretRect(e = this.model.focus) {
		return Ga(this.lines, this.model.text, e, this.measure, this.rtl);
	}
	offsetAt(e, t) {
		return qa(this.lines, this.model.text, e, t, this.measure, this.rtl);
	}
	verticalMove(e, t, n) {
		return Ya(this.lines, this.model.text, e, t, this.measure, this.rtl, n);
	}
	selectionBoxes() {
		return Xa(this.lines, this.model.text, this.model.start, this.model.end, this.measure, this.rtl);
	}
	compositionBoxes() {
		let e = this.model.composition;
		return e === null ? [] : Xa(this.lines, this.model.text, e.start, e.end, this.measure, this.rtl);
	}
};
//#endregion
//#region packages/core/src/editing/EditingKeymap.ts
function Hs() {
	let e = typeof navigator < "u" ? navigator.userAgent : "";
	return /Mac|iPhone|iPad|iPod/.test(e) ? "mac" : "other";
}
function Us(e, t, n, r) {
	let i = n === "mac", a = i ? t.meta : t.ctrl, o = i ? t.alt : t.ctrl, s = t.shift;
	switch (e) {
		case "ArrowLeft":
		case "ArrowRight": {
			let n = e === "ArrowLeft" ? -1 : 1;
			return i && t.meta ? {
				kind: "move",
				unit: "line",
				direction: n,
				extend: s
			} : {
				kind: "move",
				unit: o ? "word" : "grapheme",
				direction: n,
				extend: s
			};
		}
		case "ArrowUp":
		case "ArrowDown": {
			let n = e === "ArrowUp" ? -1 : 1;
			return i && t.meta ? {
				kind: "move",
				unit: "document",
				direction: n,
				extend: s
			} : {
				kind: "move",
				unit: "vertical",
				direction: n,
				extend: s
			};
		}
		case "Home": return {
			kind: "move",
			unit: t.ctrl ? "document" : "line",
			direction: -1,
			extend: s
		};
		case "End": return {
			kind: "move",
			unit: t.ctrl ? "document" : "line",
			direction: 1,
			extend: s
		};
		case "Backspace": return i && t.meta ? {
			kind: "delete",
			unit: "line",
			direction: -1
		} : {
			kind: "delete",
			unit: o ? "word" : "grapheme",
			direction: -1
		};
		case "Delete": return {
			kind: "delete",
			unit: o ? "word" : "grapheme",
			direction: 1
		};
		case "Enter": return a ? null : { kind: "newline" };
	}
	if (a && !t.alt) {
		switch (e.toLowerCase()) {
			case "a": return { kind: "selectAll" };
			case "z": return t.shift ? { kind: "redo" } : { kind: "undo" };
			case "y": return i ? null : { kind: "redo" };
		}
		return null;
	}
	return r && Ws(e) && !t.ctrl && !t.meta ? {
		kind: "insert",
		text: e
	} : null;
}
function Ws(e) {
	if (e.length === 1) return !0;
	if (e.length === 2) {
		let t = e.charCodeAt(0);
		return t >= 55296 && t <= 56319;
	}
	return !1;
}
//#endregion
//#region packages/core/src/environment/EnvironmentNotifier.ts
var Gs = class {
	listeners = /* @__PURE__ */ new Map();
	add(e, t) {
		let n = this.listeners.get(e);
		return n === void 0 && (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t), () => {
			let n = this.listeners.get(e);
			n !== void 0 && (n.delete(t), n.size === 0 && this.listeners.delete(e));
		};
	}
	isEmpty() {
		return this.listeners.size === 0;
	}
	handleEnvironmentChange(e) {
		let t = this.listeners.get(e);
		if (t !== void 0) for (let e of t) e();
	}
	handleNodeRemoved(e) {
		this.listeners.delete(e);
	}
};
//#endregion
//#region packages/core/src/find/TextFind.ts
function Ks(e, t, n, r = {}) {
	let i = [];
	if (n.length === 0) return i;
	for (let a of e) {
		let e = t(a);
		e === void 0 || e.length < n.length || qs(a, e, n, r.matchCase === !0, i);
	}
	return i;
}
function qs(e, t, n, r, i) {
	let a = t, o = n;
	if (!r) {
		let e = t.toLowerCase(), r = n.toLowerCase();
		e.length === t.length && r.length === n.length && (a = e, o = r);
	}
	for (let t = 0; t <= a.length - o.length;) {
		let n = a.indexOf(o, t);
		if (n < 0) return;
		i.push({
			node: e,
			start: n,
			end: n + o.length
		}), t = n + o.length;
	}
}
//#endregion
//#region packages/core/src/layout/LineBreaks.ts
function Js(e, t) {
	let n = e.length;
	if (n === 0) return [];
	if (t === "none") return [{
		start: 0,
		end: n
	}];
	let r = rc(e), i = nc(e) ? new Set(Aa(e)) : null, a = [], o = 0;
	for (; o < r.length - 1;) {
		for (; o < r.length - 1 && Ys(e.charCodeAt(r[o]));) o++;
		if (o >= r.length - 1) break;
		let n = r[o], s = r[o + 1];
		for (o++; o < r.length - 1;) {
			let n = e.codePointAt(r[o]), a = e.codePointAt(r[o - 1]), c = o >= 2 ? e.codePointAt(r[o - 2]) : void 0;
			if (Ys(n) || t === "char" || Xs(a, n, c) || i !== null && i.has(r[o]) && tc(a) && tc(n)) break;
			s = r[o + 1], o++;
		}
		a.push({
			start: n,
			end: s
		});
	}
	return a;
}
function Ys(e) {
	return e === 32 || e === 9 || e === 12288;
}
function Xs(e, t, n) {
	let r = Zs(e), i = Zs(t);
	return r === "ZW" ? !0 : i === "ZW" || r === "GL" || i === "GL" || i === "CL" || i === "CP" || i === "EX" || i === "IS" || i === "SY" || i === "NS" || r === "OP" || r === "QU" || i === "QU" ? !1 : r === "PR" && i === "OP" || e === 45 && t === 45 ? !0 : i === "HY" || i === "BA" ? !1 : r === "HY" || r === "BA" ? i === "B2" ? !1 : r === "HY" && i === "NU" ? n !== void 0 && !Ys(n) && n !== 45 : !0 : r === "B2" ? i !== "B2" : i === "B2" ? !0 : r === "SY" ? t > 127 : r === "IS" || r === "CP" ? i !== "AL" && i !== "NU" : r === "CL" || r === "EX" || r === "NS" ? !0 : r === "ID" ? i !== "PO" : i === "ID" && r !== "PR";
}
function Zs(e) {
	if (e >= 48 && e <= 57) return "NU";
	switch (e) {
		case 45: return "HY";
		case 8208:
		case 8210:
		case 8211:
		case 2404:
		case 2405: return "BA";
		case 8212: return "B2";
		case 8203: return "ZW";
		case 160:
		case 8209:
		case 8239:
		case 8288: return "GL";
		case 47: return "SY";
		case 44:
		case 46:
		case 58:
		case 59: return "IS";
		case 33:
		case 63:
		case 65281:
		case 65311: return "EX";
		case 41:
		case 93: return "CP";
		case 34:
		case 39:
		case 171:
		case 187:
		case 8216:
		case 8217:
		case 8220:
		case 8221: return "QU";
		case 43:
		case 177:
		case 8722:
		case 36:
		case 163:
		case 165:
		case 8364:
		case 65284:
		case 65505:
		case 65509: return "PR";
		case 37:
		case 176:
		case 8240:
		case 8451:
		case 65285: return "PO";
		case 40:
		case 91:
		case 123:
		case 12296:
		case 12298:
		case 12300:
		case 12302:
		case 12304:
		case 12308:
		case 12310:
		case 12312:
		case 12314:
		case 12317:
		case 65288:
		case 65339:
		case 65371:
		case 65375:
		case 65378: return "OP";
		case 125:
		case 12289:
		case 12290:
		case 12297:
		case 12299:
		case 12301:
		case 12303:
		case 12305:
		case 12309:
		case 12311:
		case 12313:
		case 12315:
		case 12318:
		case 12319:
		case 65289:
		case 65292:
		case 65294:
		case 65341:
		case 65373:
		case 65376:
		case 65377:
		case 65379:
		case 65380: return "CL";
		case 8229:
		case 8230:
		case 12316:
		case 12347:
		case 12443:
		case 12444:
		case 12445:
		case 12446:
		case 12539:
		case 12541:
		case 12542:
		case 65306:
		case 65307:
		case 65381: return "NS";
		default: return ec(e) || Qs(e) ? "ID" : "AL";
	}
}
function Qs(e) {
	return e >= 127462 && e <= 127487 || e >= 9728 && $s.test(String.fromCodePoint(e));
}
var $s = /^\p{Extended_Pictographic}$/u;
function ec(e) {
	return e >= 4352 && e <= 4607 || e >= 11904 && e <= 12287 || e >= 12291 && e <= 12295 || e >= 12306 && e <= 12307 || e >= 12320 && e <= 12346 || e >= 12353 && e <= 12442 || e >= 12447 && e <= 12538 || e === 12540 || e === 12543 || e >= 12544 && e <= 12799 || e >= 12800 && e <= 19903 || e >= 19968 && e <= 40959 || e >= 40960 && e <= 42191 || e >= 43360 && e <= 43391 || e >= 44032 && e <= 55295 || e >= 63744 && e <= 64255 || e >= 65072 && e <= 65103 || e >= 65296 && e <= 65305 || e >= 65313 && e <= 65338 || e >= 65345 && e <= 65370 || e >= 65382 && e <= 65439 || e >= 65504 && e <= 65510 || e >= 131072 && e <= 201551;
}
function tc(e) {
	return e >= 3584 && e <= 3711 || e >= 3712 && e <= 3839 || e >= 4096 && e <= 4255 || e >= 6016 && e <= 6143;
}
function nc(e) {
	for (let t = 0; t < e.length; t++) if (tc(e.charCodeAt(t))) return !0;
	return !1;
}
function rc(e) {
	if (ic(e)) {
		let t = [];
		for (let n = 0; n <= e.length; n++) t.push(n);
		return t;
	}
	return ka(e);
}
function ic(e) {
	for (let t = 0; t < e.length; t++) if (e.charCodeAt(t) > 127) return !1;
	return !0;
}
var ac = 1 / 64;
function oc(e, t) {
	let n = e.fontSize, r = e.lineHeight !== void 0 && e.lineHeight > 0 ? e.lineHeight : n * zo, i = n > 0 ? hc(e, t) : void 0, a = cc(e, t, i, r, n > 0), o = a.height, s = e.wrap ?? "word", c = e.maxWidth !== void 0 && e.maxWidth >= 0 ? e.maxWidth : Infinity, l = e.text, u = i === void 0 ? (n) => n.length === 0 ? 0 : t.measureRunWidth(n, e) : (e, t, n) => i.width(l, t, n), d = [], f = 0, p = 0, m = 0;
	for (;;) {
		let e = l.indexOf("\n", m);
		e < 0 && (e = l.length);
		let t = l.slice(m, e), n = Js(t, s);
		d.push({
			start: m,
			text: t,
			segments: n
		}), f = Math.max(f, u(t, m, e));
		for (let e of n) p = Math.max(p, u(t.slice(e.start, e.end), m + e.start, m + e.end));
		if (e >= l.length) break;
		m = e + 1;
	}
	let h = Math.max(c, p), g = [];
	for (let e of d) {
		let t = g.length;
		s === "none" || !isFinite(h) ? dc(l, e.text, e.start, 0, e.text.length, u, i, g) : uc(l, e.text, e.start, e.segments, h, u, i, g), g.length === t && g.push({
			start: e.start,
			end: e.start,
			text: "",
			width: 0
		});
	}
	if (e.maxLines !== void 0 && e.maxLines >= 1 && g.length > e.maxLines) g.length = e.maxLines, e.overflow === "ellipsis" && (g[g.length - 1] = fc(l, g[g.length - 1], c, u, i));
	else if (e.overflow === "ellipsis" && isFinite(c)) for (let e = 0; e < g.length; e++) g[e].width > c && (g[e] = fc(l, g[e], c, u, i));
	return {
		lines: g,
		width: Math.max(p, Math.min(f, c)),
		height: g.length * o,
		lineHeight: o,
		ascent: a.ascent,
		descent: a.descent,
		firstBaseline: a.baseline,
		minContentWidth: p,
		maxContentWidth: f
	};
}
function sc(e, t = .8, n = .2) {
	return {
		ascent: e * t,
		descent: e * n
	};
}
function cc(e, t, n, r, i) {
	let a = i ? t.fontMetrics(e) : {
		ascent: 0,
		descent: 0
	};
	if (n === void 0) return {
		ascent: a.ascent,
		descent: a.descent,
		baseline: a.ascent + lc(r, a),
		height: r
	};
	let o = a.ascent, s = a.descent, c = a.ascent + lc(r, a), l = r - c;
	for (let e of n.spans) {
		let i = t.fontMetrics(n.requestAt(e.start)), a = lc(r, i);
		o = Math.max(o, i.ascent), s = Math.max(s, i.descent), c = Math.max(c, i.ascent + a), l = Math.max(l, r - i.ascent - a);
	}
	return {
		ascent: o,
		descent: s,
		baseline: c,
		height: c + l
	};
}
function lc(e, t) {
	return Math.floor((e - (t.ascent + t.descent)) / 2);
}
function uc(e, t, n, r, i, a, o, s) {
	let c = o === void 0 ? a(" ", n, n) : 0, l = (e, r) => {
		let i = 0;
		for (let s = e; s < r; s++) {
			let e = t.charCodeAt(s) === 12288 ? "　" : " ";
			i += o === void 0 ? e === " " ? c : a(e, n + s, n + s) : o.widthOf(e, n + s);
		}
		return i;
	}, u = -1, d = -1, f = 0, p = !0;
	for (let c of r) {
		let r = a(t.slice(c.start, c.end), n + c.start, n + c.end);
		if (u < 0) u = p ? 0 : c.start, d = c.end, f = l(u, c.start) + r;
		else {
			let m = f + l(d, c.start) + r;
			m <= i + ac ? (d = c.end, f = m) : (dc(e, t, n, u, d, a, o, s), p = !1, u = c.start, d = c.end, f = r);
		}
	}
	u >= 0 && dc(e, t, n, u, d, a, o, s);
}
function dc(e, t, n, r, i, a, o, s) {
	let c = t.slice(r, i), l = n + r, u = n + i;
	if (o === void 0) {
		s.push({
			start: l,
			end: u,
			text: c,
			width: a(c, l, u)
		});
		return;
	}
	let d = o.cut(e, l, u, 0), f = 0;
	for (let e of d) f += e.width;
	s.push({
		start: l,
		end: u,
		text: c,
		width: f,
		runs: d
	});
}
function fc(e, t, n, r, i) {
	if (!isFinite(n)) return t;
	let a = t.text;
	for (;;) {
		let o = a.replace(/\s+$/, ""), s = o + "…", c = t.start + o.length, l = i === void 0 ? r(s, t.start, c) : r(o, t.start, c) + i.widthOf("…", Math.max(t.start, c - 1));
		if (l <= n || o.length === 0) return {
			start: t.start,
			end: c,
			text: s,
			width: l,
			runs: i === void 0 ? void 0 : pc(e, i, t.start, c, l)
		};
		a = o.slice(0, mc(o, o.length));
	}
}
function pc(e, t, n, r, i) {
	let a = t.cut(e, n, r, 0);
	if (a.length === 0) return [{
		span: -1,
		start: n,
		end: r,
		text: "…",
		x: 0,
		width: i
	}];
	let o = a[a.length - 1];
	return a[a.length - 1] = {
		span: o.span,
		start: o.start,
		end: o.end,
		text: o.text + "…",
		x: o.x,
		width: i - o.x
	}, a;
}
function mc(e, t) {
	let n = e.charCodeAt(t - 1);
	return n >= 56320 && n <= 57343 && t - 2 >= 0 ? t - 2 : t - 1;
}
//#endregion
//#region packages/core/src/layout/TextMeasurer.ts
function hc(e, t) {
	let n = e.spans;
	if (n === void 0 || n.length === 0) return;
	let r = n.map((t) => ({
		...e,
		spans: void 0,
		fontFamily: t.fontFamily ?? e.fontFamily,
		fontWeight: t.fontWeight ?? e.fontWeight,
		fontSize: t.fontSize ?? e.fontSize,
		fontStyle: t.fontStyle ?? e.fontStyle,
		fontStretch: t.fontStretch ?? e.fontStretch,
		fontVariant: t.fontVariant ?? e.fontVariant,
		fontKerning: t.fontKerning ?? e.fontKerning,
		letterSpacing: t.letterSpacing ?? e.letterSpacing
	})), i = {
		...e,
		spans: void 0
	}, a = (e) => {
		for (let t = 0; t < n.length; t++) {
			if (e < n[t].start) return -1;
			if (e < n[t].end) return t;
		}
		return -1;
	}, o = (e) => {
		let t = a(e);
		return t < 0 ? i : r[t];
	}, s = (e, n, a, o) => a <= n ? 0 : t.measureRunWidth(e.slice(n, a), o < 0 ? i : r[o]), c = (e, t, r) => {
		let i = e;
		for (; i < t;) {
			let e = a(i), o = t;
			if (e >= 0) o = Math.min(t, n[e].end);
			else for (let e of n) if (e.start > i) {
				o = Math.min(t, e.start);
				break;
			}
			r(i, o, e), i = o;
		}
	};
	return {
		spans: n,
		indexAt: a,
		requestAt: o,
		width(e, t, n) {
			let r = 0;
			return c(t, n, (t, n, i) => {
				r += s(e, t, n, i);
			}), r;
		},
		widthOf(e, n) {
			return e.length === 0 ? 0 : t.measureRunWidth(e, o(n));
		},
		cut(e, t, n, r) {
			let i = [], a = r;
			return c(t, n, (t, n, r) => {
				let o = s(e, t, n, r);
				i.push({
					span: r,
					start: t,
					end: n,
					text: e.slice(t, n),
					x: a,
					width: o
				}), a += o;
			}), i;
		}
	};
}
var gc = 4096, _c = class {
	paragraphs = /* @__PURE__ */ new Map();
	layout(e) {
		let t = vc(e), n = this.paragraphs.get(t);
		if (n !== void 0) return this.paragraphs.delete(t), this.paragraphs.set(t, n), n;
		let r = oc(e, this);
		if (this.paragraphs.size >= gc) {
			let e = this.paragraphs.keys().next().value;
			e !== void 0 && this.paragraphs.delete(e);
		}
		return this.paragraphs.set(t, r), r;
	}
	measure(e) {
		let t = this.layout(e);
		return {
			width: t.width,
			height: t.height
		};
	}
	get cachedParagraphs() {
		return this.paragraphs.size;
	}
	invalidate() {
		this.paragraphs.clear();
	}
};
function vc(e) {
	return `${e.fontSize}\0${e.maxWidth ?? ""}\0${e.fontFamily ?? ""}\0${e.fontWeight ?? ""}\0${e.lineHeight ?? ""}\0${e.letterSpacing ?? ""}\0${e.wrap ?? ""}\0${e.maxLines ?? ""}\0${e.overflow ?? ""}\0${e.fontStyle ?? ""}\0${e.fontStretch ?? ""}\0${e.fontVariant ?? ""}\0${e.fontKerning ?? ""}\0${bc(e.spans)}\0${e.text}`;
}
var yc = /* @__PURE__ */ new WeakMap();
function bc(e) {
	if (e === void 0 || e.length === 0) return "";
	let t = yc.get(e);
	if (t !== void 0) return t;
	let n = "";
	for (let t of e) n += `${t.start}:${t.end}:${t.fontFamily ?? ""}:${t.fontWeight ?? ""}:${t.fontSize ?? ""}:${t.fontStyle ?? ""}:${t.fontStretch ?? ""}:${t.fontVariant ?? ""}:${t.fontKerning ?? ""}:${t.letterSpacing ?? ""};`;
	return yc.set(e, n), n;
}
var xc = class extends _c {
	glyphWidth;
	ascentFactor;
	descentFactor;
	constructor(e = {}) {
		super(), this.glyphWidth = e.glyphWidth ?? .6, this.ascentFactor = e.ascent ?? .8, this.descentFactor = e.descent ?? .2;
	}
	measureRunWidth(e, t) {
		let n = 0;
		for (let t of e) n++;
		return n * t.fontSize * this.glyphWidth;
	}
	fontMetrics(e) {
		return sc(e.fontSize, this.ascentFactor, this.descentFactor);
	}
};
//#endregion
//#region packages/core/src/selection/TextSelectionGeometry.ts
function Sc(e, t, n, r) {
	let i = ws(e, n, t);
	return wc(Ts(t, n, r.layout(i)), e, i, n, r);
}
function Cc(e, t, n, r, i) {
	return wc(e, t, ws(t, r, n), r, i);
}
function wc(e, t, n, r, i) {
	let a = e.length === 0 ? 0 : e[e.length - 1].end, o = hc(n, i);
	return {
		lines: e,
		text: a === t.length ? t : t.slice(0, a),
		start: e.length === 0 ? 0 : e[0].start,
		end: a,
		measure: (e, r) => e.length === 0 ? 0 : o === void 0 || r === void 0 ? i.measureRunWidth(e, n) : o.width(t, r, r + e.length),
		rtl: r.rtl
	};
}
function Tc(e) {
	return e.lines.length > 0 && e.end > e.start;
}
function Ec(e, t, n) {
	return e.lines.length === 0 ? 0 : qa(e.lines, e.text, t, n, e.measure, e.rtl);
}
function Dc(e, t, n) {
	let r = kc(t, e.start, e.end), i = kc(n, e.start, e.end);
	return e.lines.length === 0 || i <= r ? [] : Xa(e.lines, e.text, r, i, e.measure, e.rtl);
}
function Oc(e, t) {
	return Na(e.text, kc(t, e.start, e.end));
}
function kc(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
//#endregion
//#region packages/core/src/find/UiFindController.ts
var Ac = 8, jc = class {
	host;
	selection;
	platform;
	paint = cs();
	listeners = /* @__PURE__ */ new Set();
	opened = !1;
	field = null;
	currentQuery = "";
	options = {};
	found = [];
	active = -1;
	highlighted = [];
	constructor(e, t, n = {}) {
		this.host = e, this.selection = t, this.platform = n.platform ?? Hs();
	}
	get isOpen() {
		return this.opened;
	}
	onChange(e) {
		return this.listeners.add(e), () => this.listeners.delete(e);
	}
	setField(e) {
		this.field = e;
	}
	open() {
		this.opened || (this.opened = !0, this.notify()), this.field !== null && this.host.focus(this.field);
	}
	close() {
		!this.opened && this.currentQuery.length === 0 || (this.opened = !1, this.clear());
	}
	handleKey(e, t) {
		return (this.platform === "mac" ? t.meta : t.ctrl) && !t.alt && (e === "f" || e === "F") ? (this.open(), !0) : e === "Escape" && this.opened ? (this.close(), !0) : !1;
	}
	get query() {
		return this.currentQuery;
	}
	get matches() {
		return this.found;
	}
	get matchCount() {
		return this.found.length;
	}
	get activeIndex() {
		return this.active;
	}
	search(e, t = {}) {
		return this.currentQuery = e, this.options = t, e.length === 0 ? (this.clear(), 0) : (this.found = this.collect(e, t), this.highlight(), this.activate(this.found.length > 0 ? 0 : -1), this.notify(), this.found.length);
	}
	refresh() {
		if (this.currentQuery.length === 0) return;
		let e = this.found[this.active];
		this.found = this.collect(this.currentQuery, this.options), this.highlight();
		let t = e === void 0 ? -1 : this.found.findIndex((t) => t.node === e.node && t.start === e.start && t.end === e.end);
		this.activate(t >= 0 ? t : this.found.length > 0 ? 0 : -1), this.notify();
	}
	next() {
		return this.step(1);
	}
	previous() {
		return this.step(-1);
	}
	clear() {
		this.currentQuery = "", this.found = [], this.active = -1;
		for (let e of this.highlighted) Lo(e) && this.host.markDirty(e, k.Paint);
		this.highlighted = [], this.notify();
	}
	handleNodeRemoved(e) {
		this.currentQuery.length !== 0 && (this.highlighted.includes(e) || this.found.some((t) => t.node === e)) && this.clear();
	}
	notify() {
		for (let e of this.listeners) e();
	}
	step(e) {
		if (this.found.length === 0) return !1;
		let t = ((this.active < 0 ? e > 0 ? -1 : 0 : this.active) + e + this.found.length) % this.found.length;
		return this.activate(t), this.notify(), !0;
	}
	collect(e, t) {
		let n = Ks(Mo(this.host.root()), Ao, e, t), r = /* @__PURE__ */ new Map();
		return n.filter((e) => {
			let t = r.get(e.node);
			return t === void 0 && (t = this.geometryEndOf(e.node), r.set(e.node, t)), e.end <= t;
		});
	}
	highlight() {
		let e = /* @__PURE__ */ new Map();
		for (let t of this.found) {
			let n = e.get(t.node);
			n === void 0 ? e.set(t.node, [{
				start: t.start,
				end: t.end
			}]) : n.push({
				start: t.start,
				end: t.end
			});
		}
		for (let [t, n] of e) Io(t, n) && this.host.markDirty(t, k.Paint);
		for (let t of this.highlighted) !e.has(t) && Lo(t) && this.host.markDirty(t, k.Paint);
		this.highlighted = Array.from(e.keys());
	}
	activate(e) {
		if (this.active = e, e < 0) {
			this.selection.clear();
			return;
		}
		let t = this.found[e];
		this.selection.selectRange(t.node, t.start, t.end), this.revealMatch(t);
	}
	revealMatch(e) {
		let t = Dc(this.geometryOf(e.node), e.start, e.end);
		if (t.length === 0) return;
		let n = t[0];
		this.host.reveal(e.node, {
			x: n.x - Ac,
			y: n.y - Ac,
			width: n.width + 16,
			height: n.height + 16
		});
	}
	geometryEndOf(e) {
		return this.geometryOf(e).end;
	}
	geometryOf(e) {
		let t = this.host.recordFor(e), n = $o(e, this.paint), r = t === void 0 ? {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		} : {
			x: t.paddingLeft,
			y: t.paddingTop,
			width: Math.max(0, t.width - t.paddingLeft - t.paddingRight),
			height: Math.max(0, t.height - t.paddingTop - t.paddingBottom)
		};
		return Sc(n.text ?? "", r, n, this.host.measurer);
	}
}, Mc = class {
	stores = /* @__PURE__ */ new WeakMap();
	errorReporter = null;
	onListenerError(e) {
		this.errorReporter = e;
	}
	typeCount = /* @__PURE__ */ new Map();
	addEventListener(e, t, n, r = {}) {
		let i = r.capture ?? !1, a = this.stores.get(e);
		a === void 0 && (a = /* @__PURE__ */ new Map(), this.stores.set(e, a));
		let o = a.get(t);
		o === void 0 && (o = [], a.set(t, o)), !o.some((e) => e.listener === n && e.capture === i) && (o.push({
			listener: n,
			capture: i
		}), this.typeCount.set(t, (this.typeCount.get(t) ?? 0) + 1));
	}
	removeEventListener(e, t, n, r = {}) {
		let i = this.stores.get(e);
		if (i === void 0) return;
		let a = i.get(t);
		if (a === void 0) return;
		let o = r.capture ?? !1, s = a.findIndex((e) => e.listener === n && e.capture === o);
		if (s !== -1 && (a.splice(s, 1), a.length === 0)) {
			i.delete(t), i.size === 0 && this.stores.delete(e);
			let n = (this.typeCount.get(t) ?? 0) - 1;
			n <= 0 ? this.typeCount.delete(t) : this.typeCount.set(t, n);
		}
	}
	hasListeners(e) {
		return (this.typeCount.get(e) ?? 0) > 0;
	}
	listenerTypes(e) {
		let t = this.stores.get(e);
		return t === void 0 ? [] : [...t.keys()];
	}
	dispatch(e, t) {
		if (!this.hasListeners(e.type)) return e;
		e.target = t, e.currentTarget = null;
		let n = e.type === j.Focus || e.type === j.Blur || e.type === j.PointerEnter || e.type === j.PointerLeave, r = [];
		for (let e = t; e !== null; e = e.parent) r.push(e);
		if (n) this.invokeListeners(t, e, !0), this.invokeListeners(t, e, !1);
		else {
			for (let t = r.length - 1; t >= 1 && !e.immediateStopped && !e.propagationStopped; --t) this.invokeListeners(r[t], e, !0);
			!e.propagationStopped && !e.immediateStopped && (this.invokeListeners(t, e, !0), this.invokeListeners(t, e, !1));
			for (let t = 1; t <= r.length - 1 && !e.immediateStopped && !e.propagationStopped; t += 1) this.invokeListeners(r[t], e, !1);
		}
		return e.currentTarget = null, e;
	}
	invokeListeners(e, t, n) {
		let r = this.stores.get(e)?.get(t.type);
		if (r !== void 0) {
			t.currentTarget = e;
			for (let i of r.slice()) if (!(i.capture !== n || t.immediateStopped)) try {
				i.listener(t);
			} catch (n) {
				this.errorReporter === null ? console.error(`UI event listener failed (${e.id}.${t.type})`, n) : this.errorReporter(n, e, t.type);
			}
		}
	}
};
function Nc(e) {
	return {
		vertical: Fc(e, "y"),
		horizontal: Fc(e, "x")
	};
}
function Pc(e, t) {
	return Fc(e, t);
}
function Fc(e, t) {
	let n = t === "y" ? e.height : e.width, r = t === "y" ? e.contentHeight : e.contentWidth;
	if (!(r > n) || n <= 0) return null;
	let i = n - 4, a = Math.min(i, Math.max(24, i * n / r)), o = Math.max(0, i - a), s = r - n, c = t === "y" ? e.scrollY : e.scrollX, l = 2 + (s > 0 ? o * c / s : 0);
	return {
		axis: t,
		thumb: t === "y" ? {
			x: e.mirrored ? e.x + 2 : e.x + e.width - 2 - 6,
			y: e.y + l,
			width: 6,
			height: a
		} : {
			x: e.x + l,
			y: e.y + e.height - 2 - 6,
			width: a,
			height: 6
		},
		track: i,
		travel: o,
		maxScroll: s,
		viewport: n
	};
}
function Ic(e, t, n) {
	if (!(t >= e.x && t < e.x + e.width && n >= e.y && n < e.y + e.height)) return null;
	let r = e.mirrored ? t < e.x + 16 : t >= e.x + e.width - 16;
	return e.contentHeight > e.height && r ? "y" : e.contentWidth > e.width && n >= e.y + e.height - 16 ? "x" : null;
}
function Lc(e, t) {
	return t.axis === "y" ? {
		x: e.mirrored ? e.x : e.x + e.width - 16,
		y: t.thumb.y,
		width: 16,
		height: t.thumb.height
	} : {
		x: t.thumb.x,
		y: e.y + e.height - 16,
		width: t.thumb.width,
		height: 16
	};
}
function Rc(e, t, n) {
	return t >= e.x && t < e.x + e.width && n >= e.y && n < e.y + e.height;
}
//#endregion
//#region packages/core/src/input/UiHitTester.ts
var zc = class {
	layout;
	root;
	point = {
		x: 0,
		y: 0
	};
	result = new Bc();
	zoneOnly = !1;
	path = [];
	liftedScratch = [];
	inLifted = !1;
	constructor(e, t) {
		this.layout = e, this.root = t;
	}
	setRoot(e) {
		this.root = e;
	}
	hitTest(e, t) {
		if (this.result.scrollbar = void 0, this.zoneOnly = !1, this.hitTestLifted(e, t) || this.hitTestNode(this.root, e, t)) {
			let e = {
				node: this.result.node,
				localX: this.result.localX,
				localY: this.result.localY
			}, t = this.result.takeScrollbar();
			return t !== void 0 && (e.scrollbar = t), e;
		}
		return null;
	}
	hitStack(e, t) {
		let n = [];
		return this.forEachLifted(e, t, (e, t, r) => (this.inLifted = !0, this.collectNode(e, t, r, n), this.inLifted = !1, !1)), this.collectNode(this.root, e, t, n), n;
	}
	collectNode(e, t, n, r) {
		if (xo(e)) return;
		let i = this.layout.recordFor(e);
		if (i === void 0 || !this.invertPoint(e, i, t, n) || i.lifted && !this.inLifted) return;
		let a = this.point.x - i.stickyOffsetX, o = this.point.y - i.stickyOffsetY, s = a >= i.x && a < i.x + i.width && o >= i.y && o < i.y + i.height;
		if (i.clips && !s) return;
		let c = i.clips && i.scrollable ? i.scrollX : 0, l = i.clips && i.scrollable ? i.scrollY : 0;
		this.collectChildren(e, a + c, o + l, r), s && So(e) && r.push(e);
	}
	collectChildren(e, t, n, r) {
		let i = this.layout.recordFor(e)?.paintOrder;
		if (i != null) {
			for (let e = i.length - 1; e >= 0; e--) this.collectNode(i[e], t, n, r);
			return;
		}
		for (let i = e.lastChild; i !== null; i = i.previousSibling) i.type === A.Fragment ? this.collectChildren(i, t, n, r) : this.collectNode(i, t, n, r);
	}
	scrollbarZoneAt(e, t) {
		this.result.scrollbar = void 0, this.zoneOnly = !0;
		let n = this.hitTestNode(this.root, e, t);
		this.zoneOnly = !1;
		let r = this.result.takeScrollbar();
		return n && r !== void 0 ? {
			node: this.result.node,
			axis: r.axis
		} : null;
	}
	toLocal(e, t, n) {
		let r = this.layout.recordFor(e);
		if (r === void 0) return {
			x: t,
			y: n
		};
		let i = this.path;
		i.length = 0;
		for (let t = e; t !== null && (t.type !== A.Fragment && i.push(t), t !== this.root); t = t.parent);
		let a = t, o = n;
		for (let e = i.length - 1; e >= 0; e--) {
			let t = i[e], n = this.layout.recordFor(t);
			n !== void 0 && (this.invertPoint(t, n, a, o) && (a = this.point.x, o = this.point.y), a -= n.stickyOffsetX, o -= n.stickyOffsetY, e > 0 && n.clips && n.scrollable && (a += n.scrollX, o += n.scrollY));
		}
		return i.length = 0, {
			x: a - r.x,
			y: o - r.y
		};
	}
	hitTestLifted(e, t) {
		return this.forEachLifted(e, t, (e, t, n) => {
			this.inLifted = !0;
			let r = this.hitTestNode(e, t, n);
			return this.inLifted = !1, r;
		});
	}
	forEachLifted(e, t, n) {
		let r = this.layout.lifted;
		if (r === void 0 || r.size === 0) return !1;
		let i = this.liftedScratch;
		i.length = 0;
		for (let e of r) i.push(e);
		let a = !1;
		for (let r = i.length - 1; r >= 0 && !a; r--) {
			let o = i[r];
			this.layout.recordFor(o) !== void 0 && (this.pointInParentSpace(o, e, t), a = n(o, this.point.x, this.point.y));
		}
		return i.length = 0, a;
	}
	pointInParentSpace(e, t, n) {
		let r = this.path;
		r.length = 0;
		for (let t = e.parent; t !== null && (t.type !== A.Fragment && r.push(t), t !== this.root); t = t.parent);
		let i = t, a = n;
		for (let e = r.length - 1; e >= 0; e--) {
			let t = r[e], n = this.layout.recordFor(t);
			n !== void 0 && (this.invertPoint(t, n, i, a) && (i = this.point.x, a = this.point.y), i -= n.stickyOffsetX, a -= n.stickyOffsetY, n.clips && n.scrollable && (i += n.scrollX, a += n.scrollY));
		}
		r.length = 0, this.point.x = i, this.point.y = a;
	}
	hitTestNode(e, t, n) {
		if (xo(e)) return !1;
		let r = this.layout.recordFor(e);
		if (r === void 0 || r.lifted && !this.inLifted || !this.invertPoint(e, r, t, n)) return !1;
		let i = this.point.x - r.stickyOffsetX, a = this.point.y - r.stickyOffsetY;
		if (r.clips) {
			if (i < r.x || i >= r.x + r.width || a < r.y || a >= r.y + r.height) return !1;
			if (r.scrollable && this.hitScrollbar(e, r, i, a)) return !0;
			if (this.zoneOnly) {
				let t = r.scrollX, n = r.scrollY;
				return this.hitTestChildren(e, i + t, a + n);
			}
			let t = r.scrollable ? r.scrollX : 0, n = r.scrollable ? r.scrollY : 0;
			return this.hitTestChildren(e, i + t, a + n) ? !0 : So(e) && this.recordHit(e, r, i, a);
		}
		return this.hitTestChildren(e, i, a) ? !0 : this.zoneOnly || !So(e) || i < r.x || i >= r.x + r.width || a < r.y || a >= r.y + r.height ? !1 : this.recordHit(e, r, i, a);
	}
	hitTestChildren(e, t, n) {
		let r = this.layout.recordFor(e)?.paintOrder;
		if (r != null) {
			for (let e = r.length - 1; e >= 0; e--) if (!this.outsideSubtree(r[e], t, n) && this.hitTestNode(r[e], t, n)) return !0;
			return !1;
		}
		for (let r = e.lastChild; r !== null; r = r.previousSibling) {
			if (r.type === A.Fragment) {
				if (this.hitTestChildren(r, t, n)) return !0;
				continue;
			}
			if (!this.outsideSubtree(r, t, n) && this.hitTestNode(r, t, n)) return !0;
		}
		return !1;
	}
	outsideSubtree(e, t, n) {
		let r = this.layout.subtreeBoundsFor?.(e);
		return r === void 0 || r.boundsUnbounded ? !1 : t < r.boundsMinX || t > r.boundsMaxX || n < r.boundsMinY || n > r.boundsMaxY;
	}
	recordHit(e, t, n, r) {
		return this.result.node = e, this.result.localX = n - t.x, this.result.localY = r - t.y, !0;
	}
	hitScrollbar(e, t, n, r) {
		let i = Ic(t, n, r);
		if (i === null) return !1;
		let a = i, o = Pc(t, a), s = o !== null && Rc(Lc(t, o), n, r);
		if (!s) {
			let e = a === "y" ? "x" : "y", i = Pc(t, e);
			i !== null && Rc(Lc(t, i), n, r) && (a = e, o = i, s = !0);
		}
		if (o === null) return !1;
		let c = t.scrollbarVisibleUntil > (typeof performance < "u" ? performance.now() : Date.now());
		return !s && !c && !this.zoneOnly ? !1 : (this.recordHit(e, t, n, r), this.result.scrollbar = {
			axis: a,
			onThumb: s
		}, !0);
	}
	invertPoint(e, t, n, r) {
		let i = 1, a = 1, o = 0, s = 0, c = 0, l = 0, u = 0, d = e.properties.get("transform");
		if (typeof d == "object" && d) {
			let e = d;
			i = Vc(e.scaleX) ?? 1, a = Vc(e.scaleY) ?? 1, o = Vc(e.rotation) ?? 0, s = Vc(e.x) ?? 0, c = Vc(e.y) ?? 0, l = Vc(e.translateX) ?? 0, u = Vc(e.translateY) ?? 0;
		}
		if (i <= 0 || a <= 0) return !1;
		let f = t.x + s, p = t.y + c, m = n - l - f, h = r - u - p;
		if (o === 0) return this.point.x = m / i + f, this.point.y = h / a + p, !0;
		let g = Math.cos(o), _ = Math.sin(o), v = m * g + h * _, y = -m * _ + h * g;
		return this.point.x = v / i + f, this.point.y = y / a + p, !0;
	}
}, Bc = class {
	node = null;
	localX = 0;
	localY = 0;
	scrollbar = void 0;
	takeScrollbar() {
		return this.scrollbar;
	}
};
function Vc(e) {
	return typeof e == "number" && Number.isFinite(e) ? e : void 0;
}
//#endregion
//#region packages/core/src/input/UiFocusManager.ts
var Hc = class {
	dispatcher;
	root;
	focused = null;
	modality = "keyboard";
	listeners = /* @__PURE__ */ new Set();
	scopeListeners = /* @__PURE__ */ new Set();
	scopes = [];
	constructor(e, t) {
		this.dispatcher = t, this.root = e;
	}
	setRoot(e) {
		this.root = e, this.scopes.length = 0;
	}
	get focusedNode() {
		return this.focused;
	}
	hasFocus() {
		return this.focused !== null;
	}
	get focusModality() {
		return this.modality;
	}
	get focusVisible() {
		return this.focused !== null && this.modality === "keyboard";
	}
	noteInput(e) {
		this.modality !== e && (this.modality = e, this.focused !== null && this.notify(this.focused, e));
	}
	get scopeRoot() {
		return this.scopes.length === 0 ? this.root : this.scopes[this.scopes.length - 1].root;
	}
	get trapped() {
		return this.scopes.length > 0;
	}
	focus(e, t = "program") {
		if (!Co(e) || !this.withinScope(e)) return !1;
		if (e === this.focused) return !0;
		t !== "program" && (this.modality = t);
		let n = this.focused;
		return this.focused = e, n !== null && this.dispatcher.dispatch(new It(j.Blur, e), n), this.dispatcher.dispatch(new It(j.Focus, n), e), this.notify(e, t), !0;
	}
	onFocusChange(e) {
		return this.listeners.add(e), () => {
			this.listeners.delete(e);
		};
	}
	onScopeChange(e) {
		return this.scopeListeners.add(e), () => {
			this.scopeListeners.delete(e);
		};
	}
	notify(e, t) {
		for (let n of this.listeners) n(e, t);
	}
	notifyScope() {
		for (let e of this.scopeListeners) e();
	}
	blur() {
		if (this.focused === null) return;
		let e = this.focused;
		this.focused = null, this.dispatcher.dispatch(new It(j.Blur, null), e), this.notify(null, "program");
	}
	focusOnPress(e) {
		this.noteInput("pointer");
		for (let t = e; t !== null; t = t.parent) if (Co(t)) {
			this.focus(t, "pointer");
			return;
		}
	}
	focusNext() {
		return this.moveFocus(1);
	}
	focusPrevious() {
		return this.moveFocus(-1);
	}
	pushScope(e) {
		this.scopes.push({
			root: e,
			restore: this.focused
		}), this.settleScope(), this.notifyScope();
	}
	settleScope() {
		this.scopes.length === 0 || this.focused !== null && this.withinScope(this.focused) || this.focusNext() || this.blur();
	}
	popScope() {
		let e = this.scopes.pop();
		if (e === void 0) return;
		let t = e.restore;
		if (t !== null && this.isAttached(t) && this.focus(t)) {
			this.notifyScope();
			return;
		}
		this.focused !== null && this.isWithin(this.focused, e.root) && this.blur(), this.notifyScope();
	}
	handleNodeRemoved(e) {
		let t = this.focused !== null;
		for (this.focused !== null && !this.isAttached(this.focused) && (this.focused = null); this.scopes.length > 0 && !this.isAttached(this.scopeRoot);) this.popScope();
		t && this.focused === null && this.notify(null, "program");
	}
	moveFocus(e) {
		let t = this.collectFocusable();
		if (t.length === 0) return !1;
		let n = this.focused === null ? -1 : t.indexOf(this.focused);
		n === -1 && (n = e > 0 ? t.length - 1 : 0);
		let r = t[(n + e + t.length) % t.length];
		return this.focus(r, "keyboard");
	}
	collectFocusable() {
		let e = [], t = (n) => {
			Co(n) && e.push(n);
			for (let e = n.firstChild; e !== null; e = e.nextSibling) t(e);
		};
		return t(this.scopeRoot), e;
	}
	withinScope(e) {
		return this.scopes.length === 0 || this.isWithin(e, this.scopeRoot);
	}
	isAttached(e) {
		return this.isWithin(e, this.root);
	}
	isWithin(e, t) {
		for (let n = e; n !== null; n = n.parent) if (n === t) return !0;
		return !1;
	}
}, Uc = class {
	listeners = /* @__PURE__ */ new Map();
	focused = null;
	visible = !0;
	add(e, t) {
		let n = this.listeners.get(e);
		return n === void 0 && (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t), () => {
			let n = this.listeners.get(e);
			n !== void 0 && (n.delete(t), n.size === 0 && this.listeners.delete(e));
		};
	}
	isFocused(e) {
		return this.focused === e;
	}
	isFocusVisible(e) {
		return this.focused === e && this.visible;
	}
	handleFocusChange(e, t = !0) {
		let n = this.focused, r = this.visible;
		if (this.focused = e, this.visible = t, n === e) {
			e !== null && r !== t && this.notify(e, !0);
			return;
		}
		n !== null && this.notify(n, !1), e !== null && this.notify(e, !0);
	}
	handleNodeRemoved(e) {
		this.listeners.delete(e), this.focused === e && (this.focused = null);
	}
	notify(e, t) {
		let n = this.listeners.get(e);
		if (n !== void 0) for (let e of n) e(t);
	}
}, Wc = class {
	hitTester;
	dispatcher;
	slop;
	touchSlop;
	gestures;
	onPress;
	scrollSink;
	onHoverChange;
	editing;
	selection;
	hoverNode = null;
	downTarget = null;
	downX = 0;
	downY = 0;
	downDefaultPrevented = !1;
	activePointer = null;
	scrollbarDrag = null;
	constructor(e, t, n = {}) {
		this.hitTester = e, this.dispatcher = t, this.slop = n.slop ?? 4, this.touchSlop = n.touchSlop ?? 10, this.gestures = n.gestures ?? null, this.onPress = n.onPress ?? null, this.scrollSink = n.scrollSink ?? null, this.onHoverChange = n.onHoverChange ?? null, this.editing = n.editing, this.selection = n.selection;
	}
	get position() {
		return this.lastPosition;
	}
	lastPosition = null;
	get hoveredNode() {
		return this.hoverNode;
	}
	get pressedNode() {
		return this.downTarget;
	}
	get draggingScrollbarOf() {
		return this.scrollbarDrag?.node ?? null;
	}
	pointerDown(e, t, n = 1, r = M(), i = Pt) {
		this.lastPosition = {
			x: e,
			y: t
		};
		let a = new N(j.PointerDown, e, t, n, r, i);
		if (this.downTarget !== null || this.scrollbarDrag !== null) return this.gestures?.contactDown?.(i, e, t, this.downTarget, r), a;
		let o = this.hitTester.hitTest(e, t);
		if (o?.scrollbar !== void 0 && this.scrollSink !== null) return this.activePointer = i, this.pressScrollbar(o.node, o.scrollbar.axis, o.scrollbar.onThumb, e, t), a;
		let s = o?.node ?? null;
		return this.updateHover(s, e, t, n, r, i), s !== null && Gc(n) ? (this.dispatcher.dispatch(a, s), a.defaultPrevented || this.dispatcher.dispatch(new N(j.ContextMenu, e, t, n, r, i), s), a) : (this.gestures?.contactDown?.(i, e, t, s, r), s === null ? this.selection?.pointerDown(null, e, t, r) : (this.dispatcher.dispatch(a, s), this.gestures?.pointerDown(a, s), a.defaultPrevented || (this.onPress?.(s), this.editing !== void 0 && this.editing.isEditable(s) ? (this.editing.pointerDown(s, e, t, r), this.selection?.clear()) : this.selection?.pointerDown(s, e, t, r))), this.downTarget = s, this.downX = e, this.downY = t, this.downDefaultPrevented = a.defaultPrevented, this.activePointer = i, a);
	}
	pointerMove(e, t, n = 0, r = M(), i = Pt) {
		if (this.lastPosition = {
			x: e,
			y: t
		}, this.gestures?.contactMove?.(i, e, t), !this.ownsPress(i)) return null;
		if (this.scrollbarDrag !== null) return this.dragScrollbar(e, t), null;
		if (this.downTarget !== null) {
			let a = new N(j.PointerMove, e, t, n, r, i);
			return this.dispatcher.dispatch(a, this.downTarget), this.gestures?.pointerMove(a, this.downTarget), a.defaultPrevented || (this.editing !== void 0 && this.editing.isEditable(this.downTarget) ? this.editing.pointerMove(this.downTarget, e, t) : this.downDefaultPrevented || this.selection?.pointerMove(e, t)), a;
		}
		if (this.scrollSink?.revealScrollbars !== void 0) {
			let n = this.hitTester.scrollbarZoneAt(e, t);
			n !== null && this.scrollSink.revealScrollbars(n.node);
		}
		let a = this.hitTester.hitTest(e, t)?.node ?? null;
		if (this.updateHover(a, e, t, n, r, i), this.selection?.pointerHover?.(a, e, t), a === null) return null;
		let o = new N(j.PointerMove, e, t, n, r, i);
		return this.dispatcher.dispatch(o, a), o;
	}
	pointerUp(e, t, n = 0, r = M(), i = Pt) {
		if (this.gestures?.contactUp?.(i), !this.ownsPress(i)) return null;
		if (this.scrollbarDrag !== null) return this.dragScrollbar(e, t), this.scrollbarDrag = null, this.activePointer = null, null;
		let a = this.downTarget;
		if (a === null) return null;
		this.downTarget = null, this.activePointer = null, this.editing?.pointerUp(), this.selection?.pointerUp();
		let o = new N(j.PointerUp, e, t, n, r, i);
		this.dispatcher.dispatch(o, a), this.gestures?.pointerUp(o, a);
		let s = this.gestures?.claimed() ?? !1;
		if (!this.downDefaultPrevented && !s) {
			let o = Math.abs(e - this.downX), s = Math.abs(t - this.downY), c = i.kind === "touch" ? this.touchSlop : this.slop;
			if (o <= c && s <= c) {
				let o = new N(j.Click, e, t, n, r, i);
				this.dispatcher.dispatch(o, a);
			}
		}
		return this.releaseHover(e, t, r, i), o;
	}
	pointerCancel(e = Pt) {
		if (this.gestures?.contactUp?.(e), !this.ownsPress(e)) return;
		this.scrollbarDrag = null, this.editing?.pointerUp(), this.selection?.pointerUp();
		let t = this.downTarget;
		if (this.downTarget = null, this.activePointer = null, t === null) return;
		let n = new N(j.PointerCancel, this.downX, this.downY, 0, M(), e);
		this.dispatcher.dispatch(n, t), this.gestures?.pointerCancel(), this.releaseHover(this.downX, this.downY, M(), e);
	}
	ownsPress(e) {
		return this.activePointer === null || this.activePointer.id === e.id;
	}
	pressScrollbar(e, t, n, r, i) {
		let a = this.scrollSink, o = a.containerState(e), s = a.scrollbar?.(e, t) ?? null;
		if (o === void 0 || s === null) return;
		a.revealScrollbars?.(e);
		let c = t === "y" ? o.scrollY : o.scrollX;
		if (n) {
			this.scrollbarDrag = {
				node: e,
				axis: t,
				startPointer: t === "y" ? i : r,
				startScroll: c,
				scale: s.travel > 0 ? s.maxScroll / s.travel : 0
			};
			return;
		}
		let l = this.hitTester.toLocal(e, r, i), u = ((t === "y" ? l.y : l.x) < (t === "y" ? s.thumb.y - this.recordOrigin(e, "y") : s.thumb.x - this.recordOrigin(e, "x")) ? -1 : 1) * s.viewport;
		t === "y" ? a.scrollBy(e, 0, u, "smooth") : a.scrollBy(e, u, 0, "smooth");
	}
	recordOrigin(e, t) {
		let n = this.hitTester.toLocal(e, 0, 0);
		return t === "y" ? -n.y : -n.x;
	}
	dragScrollbar(e, t) {
		let n = this.scrollbarDrag, r = this.scrollSink, i = r.containerState(n.node);
		if (i === void 0) return;
		let a = n.axis === "y" ? t : e, o = n.startScroll + (a - n.startPointer) * n.scale, s = n.axis === "y" ? i.scrollY : i.scrollX, c = n.axis === "y" ? i.maxScrollY : i.maxScrollX, l = Math.min(Math.max(o, 0), c);
		l !== s && (n.axis === "y" ? r.scrollBy(n.node, 0, l - s) : r.scrollBy(n.node, l - s, 0)), r.revealScrollbars?.(n.node);
	}
	updateHover(e, t, n, r, i, a) {
		if (e === this.hoverNode) return;
		let o = this.hoverNode;
		if (this.hoverNode = e, o !== null) {
			let s = e === null ? /* @__PURE__ */ new Set() : new Set(this.chain(e));
			for (let e of this.chain(o)) {
				if (s.has(e)) break;
				this.dispatchBoundary(j.PointerLeave, e, t, n, r, i, a);
			}
		}
		if (e !== null) {
			let s = o === null ? /* @__PURE__ */ new Set() : new Set(this.chain(o));
			for (let o of this.chain(e)) {
				if (s.has(o)) break;
				this.dispatchBoundary(j.PointerEnter, o, t, n, r, i, a);
			}
		}
		this.onHoverChange?.(e);
	}
	chain(e) {
		let t = [];
		for (let n = e; n !== null; n = n.parent) t.push(n);
		return t;
	}
	dispatchBoundary(e, t, n, r, i, a, o) {
		let s = new N(e, n, r, i, a, o);
		this.dispatcher.dispatch(s, t);
	}
	releaseHover(e, t, n, r) {
		r.kind === "touch" && this.updateHover(null, e, t, 0, n, r);
	}
};
function Gc(e) {
	return e === 2;
}
//#endregion
//#region packages/core/src/input/UiKeyboardController.ts
var Kc = /* @__PURE__ */ new Set([
	"Shift",
	"Control",
	"Alt",
	"Meta",
	"CapsLock"
]), qc = class {
	dispatcher;
	focusManager;
	tabNavigation;
	editing;
	selection;
	find;
	activation;
	root;
	constructor(e, t, n, r = {}) {
		this.dispatcher = e, this.focusManager = t, this.root = typeof n == "function" ? n : () => n, this.tabNavigation = r.tabNavigation ?? !0, this.editing = r.editing, this.selection = r.selection, this.find = r.find, this.activation = r.activation;
	}
	keyDown(e, t = M()) {
		Kc.has(e) || this.focusManager.noteInput("keyboard");
		let n = new zt(j.KeyDown, e, t), r = this.focusManager.focusedNode, i = r ?? this.root();
		if (this.dispatcher.dispatch(n, i), !n.defaultPrevented && r !== null && this.editing !== void 0 && this.editing.handleKey(r, e, t) || !n.defaultPrevented && this.find !== void 0 && this.find.handleKey(e, t) || !n.defaultPrevented && this.selection !== void 0 && this.selection.handleKey(e, t)) return n.preventDefault(), n;
		if (!n.defaultPrevented && r !== null && (e === "Enter" || e === " ") && Jc(r)) {
			let e = this.activation?.clickAt(r) ?? {
				x: 0,
				y: 0
			};
			return this.dispatcher.dispatch(new N(j.Click, e.x, e.y, 1), r), n.preventDefault(), n;
		}
		return !n.defaultPrevented && this.tabNavigation && e === "Tab" && (t.shift ? this.focusManager.focusPrevious() : this.focusManager.focusNext()), n;
	}
	keyUp(e, t = M()) {
		let n = new zt(j.KeyUp, e, t), r = this.focusManager.focusedNode ?? this.root();
		return this.dispatcher.dispatch(n, r), n;
	}
};
function Jc(e) {
	if (xo(e)) return !1;
	let t = e.properties.get("role");
	return e.type === A.Button || t === "button" || t === "link";
}
//#endregion
//#region packages/core/src/input/UiWheelController.ts
var Yc = 16, Xc = Object.freeze({
	up: !1,
	down: !1,
	left: !1,
	right: !1
}), Zc = Object.freeze({
	up: !0,
	down: !0,
	left: !0,
	right: !0
}), Qc = .5;
function $c(e, t, n) {
	return n > 0 ? e < t - Qc : e > Qc;
}
function el(e) {
	return e !== null && e.getProperty("overscrollBehavior") === "contain";
}
function tl(e) {
	let t = e;
	for (; t.parent !== null;) t = t.parent;
	return t;
}
function nl(e, t) {
	if (e !== Ut.Pixel) return !0;
	if (t === void 0) return !1;
	let n = Math.abs(t);
	if (n < rl / 2) return !1;
	let r = n % rl;
	return r <= il || rl - r <= il;
}
var rl = 120, il = 6, al = class {
	hitTester;
	dispatcher;
	scrollSink;
	rootNode;
	constructor(e, t, n, r = null) {
		this.hitTester = e, this.dispatcher = t, this.scrollSink = n, this.rootNode = r;
	}
	lastWheelTarget = null;
	wheel(e, t, n, r, i = M(), a = Ut.Pixel, o) {
		let s = this.hitTester.hitTest(e, t)?.node ?? null;
		this.lastWheelTarget = s;
		let c = new Gt(j.Wheel, e, t, n, r, i, a, o);
		return s !== null && this.dispatcher.dispatch(c, s), !c.defaultPrevented && s !== null && this.scrollChain(s, c, n, r, a, o), c;
	}
	scrollabilityAt(e, t) {
		return this.scrollabilityOf(this.hitTester.hitTest(e, t)?.node ?? null);
	}
	scrollabilityOf(e) {
		if (e === null) return el(this.rootNode?.() ?? null) ? Zc : Xc;
		let t = !1, n = !1, r = !1, i = !1;
		for (let a = e; a !== null; a = a.parent) {
			if (!sl(a)) continue;
			let e = this.scrollSink.containerState(a);
			if (e !== void 0 && (r ||= $c(e.scrollX, e.maxScrollX, -1), i ||= $c(e.scrollX, e.maxScrollX, 1), t ||= $c(e.scrollY, e.maxScrollY, -1), n ||= $c(e.scrollY, e.maxScrollY, 1), el(a))) return Zc;
		}
		return el(tl(e)) ? Zc : {
			up: t,
			down: n,
			left: r,
			right: i
		};
	}
	scrollsAnything() {
		if (el(this.rootNode?.() ?? null)) return !0;
		for (let e of this.scrollSink.scrollContainers?.() ?? []) {
			let t = this.scrollSink.containerState(e);
			if (t !== void 0 && (t.maxScrollX > Qc || t.maxScrollY > Qc)) return !0;
		}
		return !1;
	}
	scrollChain(e, t, n, r, i, a) {
		for (let o = e; o !== null; o = o.parent) {
			if (!sl(o)) continue;
			let e = this.scrollSink.containerState(o);
			if (e === void 0) continue;
			let s = n !== 0 && $c(e.scrollX, e.maxScrollX, n), c = r !== 0 && $c(e.scrollY, e.maxScrollY, r);
			if (s || c) {
				this.applyDelta(o, e, s ? n : 0, c ? r : 0, i, ol(o, i, a)), t.markConsumed();
				return;
			}
			if (el(o)) {
				t.markConsumed();
				return;
			}
		}
		el(tl(e)) && t.markConsumed();
	}
	applyDelta(e, t, n, r, i, a) {
		this.scrollSink.scrollBy(e, n === 0 ? 0 : this.toPixels(n, i, t.viewportWidth), r === 0 ? 0 : this.toPixels(r, i, t.viewportHeight), a);
	}
	toPixels(e, t, n) {
		return t === Ut.Line ? e * Yc : t === Ut.Page ? e * (n ?? 400) : e;
	}
};
function ol(e, t, n) {
	return e.getProperty("scrollBehavior") === "instant" ? "instant" : nl(t, n) ? "smooth" : "instant";
}
function sl(e) {
	if (e.type === A.ScrollView) return !0;
	let t = e.properties.get("overflow");
	return t === "scroll" || t === "auto";
}
//#endregion
//#region packages/core/src/input/UiPinchRecognizer.ts
var cl = class {
	dispatcher;
	scaleThreshold;
	rotationThreshold;
	first = {
		id: -1,
		x: 0,
		y: 0,
		down: !1
	};
	second = {
		id: -1,
		x: 0,
		y: 0,
		down: !1
	};
	target = null;
	modifiers = M();
	startDistance = 0;
	startAngle = 0;
	lastScale = 1;
	lastRotation = 0;
	lastCenterX = 0;
	lastCenterY = 0;
	recognized = !1;
	constructor(e, t = {}) {
		this.dispatcher = e, this.scaleThreshold = t.scaleThreshold ?? .05, this.rotationThreshold = t.rotationThreshold ?? 4;
	}
	get pinching() {
		return this.recognized;
	}
	get holding() {
		return this.first.down && this.second.down;
	}
	contactDown(e, t, n, r, i) {
		return this.first.down ? this.second.down || e.id === this.first.id ? !1 : (ll(this.second, e.id, t, n), this.modifiers = i, r !== null && (this.target = r), this.startDistance = this.distance(), this.startAngle = this.angle(), this.lastScale = 1, this.lastRotation = 0, this.lastCenterX = (this.first.x + this.second.x) / 2, this.lastCenterY = (this.first.y + this.second.y) / 2, this.recognized = !1, !0) : (ll(this.first, e.id, t, n), this.target = r, !1);
	}
	contactMove(e, t, n) {
		let r = this.contactFor(e.id);
		if (r === null || (r.x = t, r.y = n, !this.holding || this.target === null || this.startDistance <= 0)) return;
		let i = this.distance() / this.startDistance, a = ul(this.angle() - this.startAngle);
		if (!this.recognized) {
			if (Math.abs(i - 1) < this.scaleThreshold && Math.abs(a) < this.rotationThreshold) return;
			this.recognized = !0, this.emit(j.PinchStart, i, a);
			return;
		}
		this.emit(j.PinchMove, i, a);
	}
	contactUp(e) {
		let t = this.contactFor(e.id);
		t !== null && (this.recognized &&= (this.emit(j.PinchEnd, this.lastScale, this.lastRotation), !1), t.down = !1, t.id = -1, !this.first.down && !this.second.down && (this.target = null));
	}
	cancel() {
		this.recognized = !1, this.first.down = !1, this.first.id = -1, this.second.down = !1, this.second.id = -1, this.target = null;
	}
	contactFor(e) {
		return this.first.down && this.first.id === e ? this.first : this.second.down && this.second.id === e ? this.second : null;
	}
	distance() {
		return Math.hypot(this.second.x - this.first.x, this.second.y - this.first.y);
	}
	angle() {
		return Math.atan2(this.second.y - this.first.y, this.second.x - this.first.x) * 180 / Math.PI;
	}
	emit(e, t, n) {
		let r = (this.first.x + this.second.x) / 2, i = (this.first.y + this.second.y) / 2, a = new Rt(e, r, i, t, n, t - this.lastScale, n - this.lastRotation, r - this.lastCenterX, i - this.lastCenterY, this.modifiers);
		this.lastScale = t, this.lastRotation = n, this.lastCenterX = r, this.lastCenterY = i, this.dispatcher.dispatch(a, this.target);
	}
};
function ll(e, t, n, r) {
	e.id = t, e.x = n, e.y = r, e.down = !0;
}
function ul(e) {
	let t = e % 360;
	return t > 180 && (t -= 360), t <= -180 && (t += 360), t;
}
//#endregion
//#region packages/core/src/input/UiGestureRecognizer.ts
var dl = 8, fl = class {
	dispatcher;
	slop;
	touchSlop;
	longPressDelay;
	velocityWindow;
	now;
	contextMenuOnLongPress;
	pinch;
	state = "idle";
	startX = 0;
	startY = 0;
	startKind = "mouse";
	claimedPress = !1;
	timer = null;
	samples = Array.from({ length: dl }, () => ({
		t: 0,
		x: 0,
		y: 0
	}));
	sampleCount = 0;
	sampleNext = 0;
	pressTarget = null;
	lastX = 0;
	lastY = 0;
	lastButtons = 0;
	lastModifiers = M();
	lastPointer = null;
	constructor(e, t = {}) {
		this.dispatcher = e, this.slop = t.slop ?? 8, this.touchSlop = t.touchSlop ?? 12, this.longPressDelay = t.longPressDelay ?? 500, this.velocityWindow = t.velocityWindow ?? 100, this.now = t.now ?? pl, this.contextMenuOnLongPress = t.contextMenuOnLongPress ?? !0, this.pinch = new cl(e, t.pinch);
	}
	pointerDown(e, t) {
		this.state === "idle" && (this.state = "pressing", this.claimedPress = !1, this.startX = e.x, this.startY = e.y, this.startKind = e.pointer.kind, this.pressTarget = t, this.remember(e), this.resetSamples(), this.armLongPress(t, e));
	}
	pointerMove(e, t) {
		if (!e.defaultPrevented) {
			if (this.remember(e), this.state === "pressing") {
				Math.hypot(e.x - this.startX, e.y - this.startY) > this.pressSlop() && (this.clearTimer(), this.state = "panning", this.claimedPress = !0, this.dispatch(j.PanStart, t, this.startX, this.startY, e), this.dispatch(j.PanMove, t, e.x, e.y, e));
				return;
			}
			if (this.state === "panning") {
				this.dispatch(j.PanMove, t, e.x, e.y, e);
				return;
			}
			if (this.state === "longPressed") {
				this.state = "dragging", this.claimedPress = !0, this.dispatch(j.DragStart, t, this.startX, this.startY, e), this.dispatch(j.DragMove, t, e.x, e.y, e);
				return;
			}
			this.state === "dragging" && this.dispatch(j.DragMove, t, e.x, e.y, e);
		}
	}
	pointerUp(e, t) {
		this.remember(e), this.state === "panning" && this.dispatchEnd(j.PanEnd, t, e.x, e.y, e), this.state === "dragging" && this.dispatchEnd(j.DragEnd, t, e.x, e.y, e), this.clearTimer(), this.state = "idle", this.pressTarget = null;
	}
	pointerCancel() {
		this.clearTimer(), this.state = "idle", this.pressTarget = null, this.pinch.cancel();
	}
	claimed() {
		return this.claimedPress;
	}
	contactDown(e, t, n, r, i) {
		this.pinch.contactDown(e, t, n, r ?? this.pressTarget, i) && this.endForPinch();
	}
	contactMove(e, t, n) {
		this.pinch.contactMove(e, t, n);
	}
	contactUp(e) {
		this.pinch.contactUp(e);
	}
	endForPinch() {
		this.state === "panning" && this.pressTarget !== null && this.dispatchEnd(j.PanEnd, this.pressTarget, this.lastX, this.lastY, null), this.state === "dragging" && this.pressTarget !== null && this.dispatchEnd(j.DragEnd, this.pressTarget, this.lastX, this.lastY, null), this.clearTimer(), this.state = "idle", this.claimedPress = !0;
	}
	armLongPress(e, t) {
		this.timer = setTimeout(() => {
			if (this.timer = null, this.state !== "pressing") return;
			this.state = "longPressed", this.claimedPress = !0;
			let n = this.dispatch(j.LongPress, e, this.startX, this.startY, t);
			this.contextMenuOnLongPress && t.pointer.kind !== "mouse" && !n.defaultPrevented && this.dispatcher.dispatch(new N(j.ContextMenu, this.startX, this.startY, t.buttons, t.modifiers, t.pointer), e);
		}, this.longPressDelay);
	}
	clearTimer() {
		this.timer !== null && (clearTimeout(this.timer), this.timer = null);
	}
	pressSlop() {
		return this.startKind === "touch" ? this.touchSlop : this.slop;
	}
	dispatch(e, t, n, r, i) {
		let a = new Lt(e, n, r, i.buttons, i.modifiers, i.pointer);
		return this.dispatcher.dispatch(a, t), a;
	}
	dispatchEnd(e, t, n, r, i) {
		let a = new Lt(e, n, r, i?.buttons ?? this.lastButtons, i?.modifiers ?? this.lastModifiers, i?.pointer ?? this.lastPointer ?? void 0, this.velocityAlong("x"), this.velocityAlong("y"));
		this.dispatcher.dispatch(a, t);
	}
	resetSamples() {
		this.sampleCount = 0, this.sampleNext = 0;
	}
	remember(e) {
		let t = this.samples[this.sampleNext];
		t.t = this.now(), t.x = e.x, t.y = e.y, this.sampleNext = (this.sampleNext + 1) % dl, this.sampleCount < dl && (this.sampleCount += 1), this.lastX = e.x, this.lastY = e.y, this.lastButtons = e.buttons, this.lastModifiers = e.modifiers, this.lastPointer = e.pointer;
	}
	velocityAlong(e) {
		if (this.sampleCount < 2) return 0;
		let t = (this.sampleNext - 1 + dl) % dl, n = this.samples[t], r = n;
		for (let e = 1; e < this.sampleCount; e += 1) {
			let i = this.samples[(t - e + dl) % dl];
			if (n.t - i.t > this.velocityWindow) break;
			r = i;
		}
		let i = n.t - r.t;
		return i <= 0 ? 0 : (e === "x" ? n.x - r.x : n.y - r.y) / i * 1e3;
	}
};
function pl() {
	return typeof performance < "u" ? performance.now() : Date.now();
}
//#endregion
//#region packages/core/src/input/UiTouchScroller.ts
var ml = class {
	scrollSink;
	momentum;
	flingVelocity;
	velocityWindow;
	now;
	container = null;
	lastX = 0;
	lastY = 0;
	samples = [];
	detach;
	constructor(e, t, n, r = {}) {
		this.scrollSink = n, this.momentum = r.momentum ?? 300, this.flingVelocity = r.flingVelocity ?? .1, this.velocityWindow = r.velocityWindow ?? 100, this.now = r.now ?? hl;
		let i = (e) => this.panStart(e), a = (e) => this.panMove(e), o = (e) => this.panEnd(e);
		e.addEventListener(t, j.PanStart, i), e.addEventListener(t, j.PanMove, a), e.addEventListener(t, j.PanEnd, o), this.detach = () => {
			e.removeEventListener(t, j.PanStart, i), e.removeEventListener(t, j.PanMove, a), e.removeEventListener(t, j.PanEnd, o);
		};
	}
	get scrollingNode() {
		return this.container;
	}
	dispose() {
		this.detach(), this.container = null, this.samples = [];
	}
	panStart(e) {
		this.container = null, this.samples = [], e.pointer.kind === "touch" && (this.lastX = e.x, this.lastY = e.y, this.container = e.target);
	}
	panMove(e) {
		if (this.container === null) return;
		let t = this.lastX - e.x, n = this.lastY - e.y;
		this.lastX = e.x, this.lastY = e.y, this.sample(e.x, e.y);
		let r = this.resolve(e.target, t, n);
		if (r === null) return;
		let { node: i, state: a } = r;
		a.horizontal ? this.scrollSink.scrollBy(i, t, 0) : this.scrollSink.scrollBy(i, 0, n), this.scrollSink.revealScrollbars?.(i);
	}
	panEnd(e) {
		let t = this.container;
		if (this.container = null, t === null) return;
		this.sample(e.x, e.y);
		let n = this.releaseVelocity();
		if (this.samples = [], n === null) return;
		let r = this.resolve(e.target, n.x, n.y);
		if (r === null) return;
		let { node: i, state: a } = r, o = a.horizontal ? n.x : n.y;
		if (Math.abs(o) < this.flingVelocity) return;
		let s = o * this.momentum;
		a.horizontal ? this.scrollSink.scrollBy(i, s, 0, "smooth") : this.scrollSink.scrollBy(i, 0, s, "smooth");
	}
	sample(e, t) {
		let n = this.now();
		for (this.samples.push({
			t: n,
			x: e,
			y: t
		}); this.samples.length > 2 && n - this.samples[0].t > this.velocityWindow;) this.samples.shift();
	}
	releaseVelocity() {
		let e = this.samples[0], t = this.samples[this.samples.length - 1];
		if (e === void 0 || t === void 0) return null;
		let n = t.t - e.t;
		return n <= 0 ? null : {
			x: (e.x - t.x) / n,
			y: (e.y - t.y) / n
		};
	}
	resolve(e, t, n) {
		let r = null;
		for (let i = e; i !== null; i = i.parent) {
			if (!sl(i)) continue;
			let e = this.scrollSink.containerState(i);
			if (e === void 0) continue;
			r ??= {
				node: i,
				state: e
			};
			let a = e.horizontal ? t : n, o = e.horizontal ? e.scrollX : e.scrollY, s = e.horizontal ? e.maxScrollX : e.maxScrollY;
			if (a < 0 && o > 0 || a > 0 && o < s) return {
				node: i,
				state: e
			};
		}
		return r;
	}
};
function hl() {
	return typeof performance < "u" ? performance.now() : Date.now();
}
//#endregion
//#region packages/core/src/input/UiEditingController.ts
var gl = 500, _l = 4, vl = 4, yl = class {
	host;
	dispatcher;
	focus;
	textFromKeys = !0;
	platform;
	paint = cs();
	focusedEditable = null;
	visible = !0;
	verticalGoalX = void 0;
	dragging = null;
	lastPress = null;
	compositionOpen = !1;
	constructor(e, t, n, r = {}) {
		this.host = e, this.dispatcher = t, this.focus = n, this.platform = r.platform ?? Hs(), this.focus.onFocusChange((e) => this.handleFocusChange(e));
	}
	get focused() {
		return this.focusedEditable;
	}
	isEditable(e) {
		return co(e);
	}
	handleKey(e, t, n) {
		if (!co(e)) return !1;
		let r = Us(t, n, this.platform, this.textFromKeys);
		return r !== null && this.execute(e, r);
	}
	execute(e, t) {
		let n = U(e), r = uo(e);
		switch (t.kind) {
			case "move": return this.move(e, n, t.unit, t.direction, t.extend), !0;
			case "delete": return r ? !0 : this.applyEdit(e, n, bl(t.unit, t.direction), null, () => {
				t.direction < 0 ? n.deleteBackward(t.unit) : n.deleteForward(t.unit);
			});
			case "newline": return lo(e) ? r ? !0 : this.applyEdit(e, n, "insertLineBreak", "\n", () => n.insertText("\n")) : !1;
			case "insert": return r ? !0 : this.applyEdit(e, n, "insertText", t.text, () => n.insertText(t.text));
			case "selectAll": return n.selectAll(), this.afterSelectionChange(e, n), !0;
			case "undo": return r || this.history(e, n, "historyUndo", () => n.undo()), !0;
			case "redo": return r || this.history(e, n, "historyRedo", () => n.redo()), !0;
		}
	}
	move(e, t, n, r, i) {
		if (n === "vertical") {
			let n = this.layoutOf(e).verticalMove(t.focus, r, this.verticalGoalX);
			n === null ? (t.moveTo(r < 0 ? 0 : t.text.length, i), this.verticalGoalX = void 0) : (t.moveTo(n.offset, i), this.verticalGoalX = n.x), this.afterSelectionChange(e, t, !0);
			return;
		}
		if (n === "line") {
			let n = this.layoutOf(e), a = n.caretRect(t.focus), o = n.lines[a.line], s = r < 0 ? Pa(t.text, t.focus) : Fa(t.text, t.focus), c = r < 0 ? o.start : o.end;
			t.moveTo(r < 0 ? Math.max(s, c) : Math.min(s, c), i), this.afterSelectionChange(e, t);
			return;
		}
		t.move(n, r, i), this.afterSelectionChange(e, t);
	}
	beforeInput(e, t) {
		let n = this.focusedEditable;
		if (n === null) return !1;
		let r = U(n), i = uo(n);
		switch (e) {
			case "insertText":
			case "insertReplacementText":
			case "insertFromDrop":
			case "insertFromYank": return t === null || t.length === 0 ? !1 : i || this.insert(n, r, e, t);
			case "insertFromPaste": return i || t !== null && this.insert(n, r, e, t);
			case "insertLineBreak":
			case "insertParagraph": return lo(n) ? i || this.applyEdit(n, r, e, "\n", () => r.insertText("\n")) : !1;
			case "deleteContentBackward":
			case "deleteWordBackward":
			case "deleteSoftLineBackward":
			case "deleteHardLineBackward":
			case "deleteContentForward":
			case "deleteWordForward":
			case "deleteSoftLineForward":
			case "deleteHardLineForward":
			case "deleteContent":
			case "deleteByCut":
			case "deleteByDrag": {
				if (i) return !0;
				let t = /Word/.test(e) ? "word" : /Line/.test(e) ? "line" : "grapheme", a = /Forward/.test(e);
				return this.applyEdit(n, r, e, null, () => {
					e === "deleteContent" || e === "deleteByCut" || e === "deleteByDrag" ? r.replaceRange(r.start, r.end, "") : a ? r.deleteForward(t) : r.deleteBackward(t);
				});
			}
			case "historyUndo": return i || this.history(n, r, e, () => r.undo());
			case "historyRedo": return i || this.history(n, r, e, () => r.redo());
			default: return !1;
		}
	}
	insertText(e) {
		let t = this.focusedEditable;
		return t === null || uo(t) ? !1 : this.insert(t, U(t), "insertText", e);
	}
	replaceText(e) {
		let t = this.focusedEditable;
		if (t === null || uo(t)) return !1;
		let n = U(t);
		return n.selectAll(), this.insert(t, n, "insertReplacementText", e);
	}
	paste(e) {
		let t = this.focusedEditable;
		return t === null || uo(t) ? this.offerPaste(e) : this.insert(t, U(t), "insertFromPaste", e);
	}
	offerPaste(e) {
		let t = this.focus.focusedNode;
		if (t === null) return !1;
		let n = new Vt(e);
		return this.dispatcher.dispatch(n, t), n.defaultPrevented;
	}
	insert(e, t, n, r) {
		let i = lo(e) ? r : r.replace(/\r\n|\r|\n/g, " ");
		return this.applyEdit(e, t, n, i, () => t.insertText(i));
	}
	compositionStart() {
		let e = this.focusedEditable;
		if (e === null || uo(e)) return;
		let t = U(e);
		t.beginComposition(), this.compositionOpen = !0, this.afterTextChange(e, t, !1);
	}
	compositionUpdate(e, t = e.length) {
		let n = this.focusedEditable;
		if (n === null || uo(n)) return;
		let r = U(n);
		r.updateComposition(e, t), this.compositionOpen = !0, this.afterTextChange(n, r, !1);
	}
	compositionEnd(e) {
		let t = this.focusedEditable;
		if (this.compositionOpen = !1, t === null || uo(t)) return;
		let n = U(t), r = lo(t) ? e : e.replace(/\r\n|\r|\n/g, " "), i = n.text;
		n.commitComposition(r), this.afterTextChange(t, n, i !== n.text);
	}
	pointerDown(e, t, n, r) {
		if (!co(e)) return;
		let i = U(e), a = this.layoutOf(e), o = this.host.toLocal(e, t, n), s = a.offsetAt(o.x, o.y), c = this.host.now(), l = this.lastPress, u = !r.shift && l !== null && l.node === e && c - l.at <= gl && Math.abs(l.x - t) <= _l && Math.abs(l.y - n) <= _l ? l.count + 1 : 1;
		if (this.lastPress = {
			node: e,
			x: t,
			y: n,
			at: c,
			count: u
		}, this.dragging = e, r.shift) i.moveTo(s, !0);
		else if (u === 2) {
			let e = Na(i.text, s);
			i.select(e.start, e.end);
		} else u >= 3 ? i.select(Pa(i.text, s), Fa(i.text, s)) : i.select(s);
		i.breakUndoGroup(), this.afterSelectionChange(e, i);
	}
	pointerMove(e, t, n) {
		if (this.dragging !== e) return;
		let r = U(e), i = this.layoutOf(e), a = this.host.toLocal(e, t, n), o = i.offsetAt(a.x, a.y);
		o !== r.focus && (r.moveTo(o, !0), this.afterSelectionChange(e, r));
	}
	pointerUp() {
		this.dragging = null;
	}
	state() {
		let e = this.focusedEditable;
		if (e === null || this.host.recordFor(e) === void 0) return null;
		let t = U(e), n = this.layoutOf(e).caretRect(), r = this.host.visibleBox(e);
		return {
			text: t.text,
			selectionStart: t.start,
			selectionEnd: t.end,
			caret: {
				x: r.x + n.x,
				y: r.y + n.y,
				width: 1,
				height: n.height
			},
			multiline: lo(e),
			composing: t.composing
		};
	}
	nextCaretChange(e) {
		let t = this.focusedEditable;
		if (t === null || !this.visible) return;
		let n = U(t);
		if (!(n.composing || !n.collapsed)) return po(n, e);
	}
	setVisible(e) {
		if (this.visible === e) return;
		this.visible = e;
		let t = this.focusedEditable;
		t !== null && (U(t).blinkOrigin = this.host.now(), this.host.markDirty(t, k.Paint));
	}
	get caretEnabled() {
		return this.visible;
	}
	handleFocusChange(e) {
		let t = this.focusedEditable, n = e !== null && co(e) ? e : null;
		if (t !== n) {
			if (t !== null) {
				let e = U(t);
				e.composing && e.commitComposition(e.text.slice(e.composition.start, e.composition.end)), e.focused = !1, this.host.markDirty(t, k.Paint);
			}
			if (this.focusedEditable = n, this.compositionOpen = !1, this.verticalGoalX = void 0, n !== null) {
				let e = U(n);
				e.focused = !0, e.blinkOrigin = this.host.now(), this.host.markDirty(n, k.Paint);
			}
		}
	}
	applyEdit(e, t, n, r, i) {
		let a = new Bt(n, r);
		if (this.dispatcher.dispatch(a, e), a.defaultPrevented) return !0;
		let o = t.text;
		return i(), this.afterTextChange(e, t, o !== t.text), !0;
	}
	history(e, t, n, r) {
		let i = new Bt(n, null);
		if (this.dispatcher.dispatch(i, e), i.defaultPrevented) return !0;
		let a = t.text;
		return r(), this.afterTextChange(e, t, a !== t.text), !0;
	}
	afterTextChange(e, t, n) {
		this.verticalGoalX = void 0, t.blinkOrigin = this.host.now(), this.host.markDirty(e, n || this.compositionOpen ? k.Content | k.Layout : k.Paint), n && this.dispatcher.dispatch(new Ht(t.text, t.start, t.end), e), this.revealCaret(e);
	}
	afterSelectionChange(e, t, n = !1) {
		n || (this.verticalGoalX = void 0), t.blinkOrigin = this.host.now(), this.host.markDirty(e, k.Paint), this.revealCaret(e);
	}
	revealCaret(e) {
		let t = this.host.recordFor(e);
		if (t === void 0) return;
		let n = this.layoutOf(e).caretRect();
		this.host.reveal(e, {
			x: n.x + t.scrollX - vl,
			y: n.y + t.scrollY - vl,
			width: 9,
			height: n.height + 8
		});
	}
	layoutOf(e) {
		let t = this.host.recordFor(e), n = $o(e, this.paint), r = t === void 0 ? {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		} : {
			x: t.paddingLeft - t.scrollX,
			y: t.paddingTop - t.scrollY,
			width: Math.max(0, t.width - t.paddingLeft - t.paddingRight),
			height: Math.max(0, t.height - t.paddingTop - t.paddingBottom)
		};
		return new Vs(n.editor, r, n, this.host.measurer);
	}
};
function bl(e, t) {
	let n = t < 0 ? "Backward" : "Forward";
	switch (e) {
		case "word": return `deleteWord${n}`;
		case "line":
		case "document": return `deleteSoftLine${n}`;
		default: return `deleteContent${n}`;
	}
}
//#endregion
//#region packages/core/src/input/UiPlatformAdapter.ts
var xl = class {
	pointer;
	wheel;
	keyboard;
	surface = null;
	pointerDownHandler = null;
	pointerMoveHandler = null;
	pointerUpHandler = null;
	pointerCancelHandler = null;
	wheelHandler = null;
	keyDownHandler = null;
	keyUpHandler = null;
	constructor(e) {
		this.pointer = e.pointerController, this.wheel = e.wheelController, this.keyboard = e.keyboardController;
	}
	get attached() {
		return this.surface !== null;
	}
	attach(e) {
		this.detach(), this.surface = e, this.pointerDownHandler = (t) => {
			let n = t, r = e.clientToLocal(n.clientX, n.clientY);
			Cl(t.target, n.pointerId), this.pointer.pointerDown(r.x, r.y, n.buttons, wl(n), Sl(n)).defaultPrevented && n.preventDefault();
		}, this.pointerMoveHandler = (t) => {
			let n = t, r = e.clientToLocal(n.clientX, n.clientY);
			this.pointer.pointerMove(r.x, r.y, n.buttons, wl(n), Sl(n)), this.syncTouchAction();
		}, this.pointerUpHandler = (t) => {
			let n = t, r = e.clientToLocal(n.clientX, n.clientY);
			this.pointer.pointerUp(r.x, r.y, n.buttons, wl(n), Sl(n));
		}, this.pointerCancelHandler = (e) => {
			this.pointer.pointerCancel(Sl(e));
		}, this.wheelHandler = (t) => {
			let n = t, r = e.clientToLocal(n.clientX, n.clientY), i = this.wheel.wheel(r.x, r.y, n.deltaX, n.deltaY, wl(n), n.deltaMode, Wt(n));
			(i.consumed || i.defaultPrevented) && n.preventDefault(), this.syncTouchAction();
		}, this.keyDownHandler = (e) => {
			let t = e;
			this.keyboard.keyDown(t.key, wl(t)).defaultPrevented && t.preventDefault();
		}, this.keyUpHandler = (e) => {
			let t = e;
			this.keyboard.keyUp(t.key, wl(t));
		}, e.pointerTarget.addEventListener("pointerdown", this.pointerDownHandler), e.pointerTarget.addEventListener("pointermove", this.pointerMoveHandler), e.pointerTarget.addEventListener("pointerup", this.pointerUpHandler), e.pointerTarget.addEventListener("pointercancel", this.pointerCancelHandler), e.pointerTarget.addEventListener("wheel", this.wheelHandler, { passive: !1 }), e.keyboardTarget.addEventListener("keydown", this.keyDownHandler), e.keyboardTarget.addEventListener("keyup", this.keyUpHandler), this.syncTouchAction();
	}
	syncTouchAction() {
		this.surface?.setTouchAction?.(jl(this.wheel.scrollsAnything()));
	}
	detach() {
		if (this.surface === null) return;
		let e = this.surface;
		this.pointerDownHandler !== null && e.pointerTarget.removeEventListener("pointerdown", this.pointerDownHandler), this.pointerMoveHandler !== null && e.pointerTarget.removeEventListener("pointermove", this.pointerMoveHandler), this.pointerUpHandler !== null && e.pointerTarget.removeEventListener("pointerup", this.pointerUpHandler), this.pointerCancelHandler !== null && e.pointerTarget.removeEventListener("pointercancel", this.pointerCancelHandler), this.wheelHandler !== null && e.pointerTarget.removeEventListener("wheel", this.wheelHandler), this.keyDownHandler !== null && e.keyboardTarget.removeEventListener("keydown", this.keyDownHandler), this.keyUpHandler !== null && e.keyboardTarget.removeEventListener("keyup", this.keyUpHandler), e.dispose?.(), this.surface = null, this.pointerDownHandler = null, this.pointerMoveHandler = null, this.pointerUpHandler = null, this.pointerCancelHandler = null, this.wheelHandler = null, this.keyDownHandler = null, this.keyUpHandler = null;
	}
};
function Sl(e) {
	let t = e.pointerType;
	return t !== "touch" && t !== "pen" && t !== "mouse" ? Pt : {
		id: e.pointerId,
		kind: t
	};
}
function Cl(e, t) {
	let n = e;
	if (typeof n?.setPointerCapture == "function") try {
		n.setPointerCapture(t);
	} catch {}
}
function wl(e) {
	return {
		shift: e.shiftKey,
		ctrl: e.ctrlKey,
		alt: e.altKey,
		meta: e.metaKey
	};
}
function Tl(e) {
	let t = e.style;
	t.touchAction = "none", t.userSelect = "none", t.setProperty("-webkit-user-select", "none"), t.setProperty("-webkit-touch-callout", "none"), t.setProperty("-webkit-tap-highlight-color", "transparent"), t.outline = "none", e.addEventListener("contextmenu", El);
}
function El(e) {
	e.preventDefault();
}
var Dl = class {
	element;
	keyboardRoot;
	rect = null;
	viewportRoot = null;
	resizeObserver = null;
	invalidateRect = () => {
		this.rect = null;
	};
	constructor(e, t = Ol() ?? kl) {
		this.element = e, this.keyboardRoot = t;
		let n = Ol();
		n !== null && (n.addEventListener("scroll", this.invalidateRect, {
			capture: !0,
			passive: !0
		}), n.addEventListener("resize", this.invalidateRect, { passive: !0 }), n.addEventListener("pointerdown", this.invalidateRect, {
			capture: !0,
			passive: !0
		}), this.viewportRoot = n), this.resizeObserver = Al(e, this.invalidateRect);
	}
	get pointerTarget() {
		return this.element;
	}
	get keyboardTarget() {
		return this.keyboardRoot;
	}
	clientToLocal(e, t) {
		let n = this.rect ?? this.readRect();
		return {
			x: e - n.left,
			y: t - n.top
		};
	}
	setTouchAction(e) {
		this.element.style.touchAction !== e && (this.element.style.touchAction = e);
	}
	dispose() {
		let e = this.viewportRoot;
		e !== null && (e.removeEventListener("scroll", this.invalidateRect, { capture: !0 }), e.removeEventListener("resize", this.invalidateRect), e.removeEventListener("pointerdown", this.invalidateRect, { capture: !0 }), this.viewportRoot = null), this.resizeObserver?.disconnect(), this.resizeObserver = null, this.rect = null;
	}
	readRect() {
		let e = typeof this.element.getBoundingClientRect == "function" ? this.element.getBoundingClientRect() : {
			left: 0,
			top: 0
		}, t = {
			left: e.left,
			top: e.top
		};
		return (this.viewportRoot !== null || this.resizeObserver !== null) && (this.rect = t), t;
	}
};
function Ol() {
	return typeof window > "u" ? null : window;
}
var kl = {
	addEventListener() {},
	removeEventListener() {}
};
function Al(e, t) {
	if (typeof ResizeObserver > "u") return null;
	try {
		let n = new ResizeObserver(t);
		return n.observe(e), n;
	} catch {
		return null;
	}
}
function jl(e) {
	return e ? "none" : "auto";
}
//#endregion
//#region packages/core/src/layout/Alignment.ts
var Ml = /* @__PURE__ */ function(e) {
	return e[e.Start = 0] = "Start", e[e.Center = 1] = "Center", e[e.End = 2] = "End", e[e.SpaceBetween = 3] = "SpaceBetween", e[e.SpaceEvenly = 4] = "SpaceEvenly", e[e.SpaceAround = 5] = "SpaceAround", e;
}({}), G = /* @__PURE__ */ function(e) {
	return e[e.Start = 0] = "Start", e[e.Center = 1] = "Center", e[e.End = 2] = "End", e[e.Stretch = 3] = "Stretch", e[e.Baseline = 4] = "Baseline", e;
}({});
function Nl(e) {
	if (typeof e == "string") switch (e) {
		case "center": return 1;
		case "end": return 2;
		case "space-between": return 3;
		case "space-evenly": return 4;
		case "space-around": return 5;
	}
	return typeof e == "number" ? e : 0;
}
function K(e) {
	if (typeof e == "string") switch (e) {
		case "start": return 0;
		case "center": return 1;
		case "end": return 2;
		case "stretch": return 3;
		case "baseline": return 4;
	}
	if (typeof e == "number") return e;
}
var q = /* @__PURE__ */ function(e) {
	return e[e.Start = 0] = "Start", e[e.Center = 1] = "Center", e[e.End = 2] = "End", e[e.SpaceBetween = 3] = "SpaceBetween", e[e.SpaceEvenly = 4] = "SpaceEvenly", e[e.SpaceAround = 5] = "SpaceAround", e[e.Stretch = 6] = "Stretch", e;
}({});
function Pl(e) {
	switch (e) {
		case "start": return 0;
		case "center": return 1;
		case "end": return 2;
		case "space-between": return 3;
		case "space-evenly": return 4;
		case "space-around": return 5;
		default: return 6;
	}
}
//#endregion
//#region packages/core/src/layout/GridLayout.ts
function Fl(e, t, n, r) {
	let i = /* @__PURE__ */ new Set(), a = e.map(() => null), o = Math.max(t, 1), s = Math.max(n, 1), c = (e) => {
		for (let t = e.columnStart; t < e.columnEnd; t++) for (let n = e.rowStart; n < e.rowEnd; n++) i.add(`${t},${n}`);
		o = Math.max(o, e.columnEnd), s = Math.max(s, e.rowEnd);
	}, l = (e, t, n, r) => {
		for (let a = e; a < e + n; a++) for (let e = t; e < t + r; e++) if (i.has(`${a},${e}`)) return !1;
		return !0;
	};
	e.forEach((e, t) => {
		if (e.column !== void 0 && e.row !== void 0) {
			let n = {
				item: e.item,
				columnStart: e.column - 1,
				columnEnd: e.column - 1 + e.columnSpan,
				rowStart: e.row - 1,
				rowEnd: e.row - 1 + e.rowSpan
			};
			a[t] = n, c(n);
		}
	});
	let u = r === "row";
	e.forEach((e, t) => {
		if (a[t] !== null) return;
		let n = u ? e.row : e.column;
		if (n === void 0) return;
		let r = n - 1, i = u ? e.rowSpan : e.columnSpan, o = u ? e.columnSpan : e.rowSpan, s = 0;
		for (; !l(u ? s : r, u ? r : s, u ? o : i, u ? i : o);) s++;
		let d = u ? {
			item: e.item,
			columnStart: s,
			columnEnd: s + o,
			rowStart: r,
			rowEnd: r + i
		} : {
			item: e.item,
			columnStart: r,
			columnEnd: r + i,
			rowStart: s,
			rowEnd: s + o
		};
		a[t] = d, c(d);
	});
	let d = u ? o : s, f = 0, p = 0;
	return e.forEach((e, t) => {
		if (a[t] !== null) return;
		let n = u ? e.columnSpan : e.rowSpan, r = u ? e.rowSpan : e.columnSpan, i = u ? e.row : e.column;
		if (i !== void 0) {
			let e = i - 1;
			e !== f && (f = e, p = 0);
		}
		for (;;) {
			if (p + n > Math.max(d, n)) {
				p = 0, f++;
				continue;
			}
			let i = u ? p : f, o = u ? f : p;
			if (l(i, o, u ? n : r, u ? r : n)) {
				let s = u ? {
					item: e.item,
					columnStart: i,
					columnEnd: i + n,
					rowStart: o,
					rowEnd: o + r
				} : {
					item: e.item,
					columnStart: i,
					columnEnd: i + r,
					rowStart: o,
					rowEnd: o + n
				};
				a[t] = s, c(s), p += n;
				break;
			}
			p++;
		}
	}), {
		placements: a,
		columnCount: o,
		rowCount: s
	};
}
function Il(e) {
	let { sizes: t, available: n, gap: r, distribution: i, items: a } = e, o = t.length, s = t.map((e) => Ll(e, n)), c = r * Math.max(0, o - 1), l = a.map((e) => ({
		...e,
		span: e.end - e.start
	})).filter((e) => e.span === 1 || e.span > 1 && !Rl(s, e.start, e.end)).sort((e, t) => e.span - t.span);
	for (let e of l) Bl(s, e.start, e.end, e.contribution.min, r, "base"), Bl(s, e.start, e.end, e.contribution.max, r, "limit");
	for (let e of s) isFinite(e.limit) || (e.limit = e.base), e.limit = Math.max(e.limit, e.base);
	let u = s.reduce((e, t) => e + t.base, 0) + c;
	if (n !== void 0) {
		let e = n - c - s.reduce((e, t) => e + t.base, 0);
		e > 0 && Vl(s, e);
	} else for (let e of s) e.flex === 0 && (e.base = e.limit);
	let d = s.filter((e) => e.flex > 0);
	if (d.length > 0) {
		let e;
		if (n !== void 0) e = Hl(s, n - c);
		else {
			e = 0;
			for (let t of d) e = Math.max(e, t.base / t.flex);
			for (let t of a) if (t.end > t.start && zl(s, t.start, t.end)) {
				let n = 0;
				for (let e = t.start; e < t.end; e++) n += s[e].flex;
				n > 0 && (e = Math.max(e, (t.contribution.max - r * (t.end - t.start - 1)) / n));
			}
		}
		for (let t of d) t.base = Math.max(t.base, e * t.flex), t.limit = t.base;
	}
	let f = s.reduce((e, t) => e + t.base, 0) + c;
	if (n !== void 0 && i === q.Stretch) {
		let e = s.filter((e) => e.auto && e.flex === 0), t = n - f;
		if (t > 0 && e.length > 0) {
			for (let n of e) n.base += t / e.length;
			f = n;
		}
	}
	let p = 0, m = r;
	if (n !== void 0 && n > f && o > 0) {
		let e = n - f;
		switch (i) {
			case q.Center:
				p = e / 2;
				break;
			case q.End:
				p = e;
				break;
			case q.SpaceBetween:
				o > 1 && (m = r + e / (o - 1));
				break;
			case q.SpaceAround: {
				let t = e / o;
				p = t / 2, m = r + t;
				break;
			}
			case q.SpaceEvenly: {
				let t = e / (o + 1);
				p = t, m = r + t;
				break;
			}
		}
	}
	let h = [], g = p;
	for (let e = 0; e < o; e++) h.push({
		offset: g,
		size: s[e].base,
		base: s[e].base
	}), g += s[e].base + (e < o - 1 ? m : 0);
	return {
		tracks: h,
		total: f,
		minTotal: u
	};
}
function Ll(e, t) {
	let n = {
		base: 0,
		limit: Infinity,
		flex: 0,
		intrinsicMin: !1,
		intrinsicMax: !1,
		auto: !1
	};
	if (typeof e == "number") return n.base = e, n.limit = e, n;
	if (Lr(e)) return t === void 0 ? (n.intrinsicMin = !0, n.intrinsicMax = !0, n.auto = !0) : (n.base = t * e.value / 100, n.limit = n.base), n;
	if (Ir(e)) return n.intrinsicMin = !0, n.intrinsicMax = !0, n.auto = !0, n;
	if (Nr(e)) return n.flex = e.value, n.intrinsicMin = !0, n;
	if (Pr(e)) {
		let { min: r, max: i } = e;
		return typeof r == "number" ? n.base = r : Lr(r) && t !== void 0 ? n.base = t * r.value / 100 : n.intrinsicMin = !0, typeof i == "number" ? n.limit = i : Lr(i) && t !== void 0 ? n.limit = t * i.value / 100 : Nr(i) ? n.flex = i.value : (n.intrinsicMax = !0, n.auto = !0), n;
	}
	throw Error(`Invalid grid track size ${JSON.stringify(e)}. Use a number, percent(), auto, fr() or minmax().`);
}
function Rl(e, t, n) {
	for (let r = t; r < n; r++) if (e[r].flex > 0) return !0;
	return !1;
}
function zl(e, t, n) {
	for (let r = t; r < n; r++) if (e[r].flex === 0) return !1;
	return !0;
}
function Bl(e, t, n, r, i, a) {
	let o = [], s = i * (n - t - 1);
	for (let r = t; r < n; r++) {
		let t = e[r], n = a === "base" ? t.base : isFinite(t.limit) ? t.limit : t.base;
		s += n, (a === "base" ? t.intrinsicMin : t.intrinsicMax) && o.push(t);
	}
	let c = r - s;
	if (c <= 0 || o.length === 0) return;
	let l = c / o.length;
	for (let e of o) a === "base" ? e.base += l : e.limit = (isFinite(e.limit) ? e.limit : e.base) + l;
}
function Vl(e, t) {
	let n = t;
	for (let t = 0; t < e.length + 1 && n > 1e-9; t++) {
		let t = e.filter((e) => e.flex === 0 && e.limit > e.base + 1e-9);
		if (t.length === 0) return;
		let r = n / t.length, i = 0;
		for (let e of t) {
			let t = Math.min(r, e.limit - e.base);
			e.base += t, i += t;
		}
		if (n -= i, i <= 1e-9) return;
	}
}
function Hl(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (;;) {
		let r = t, i = 0;
		for (let t of e) t.flex > 0 && !n.has(t) ? i += t.flex : r -= t.base;
		if (i <= 0) return 0;
		let a = Math.max(0, r) / Math.max(i, 1), o = !1;
		for (let t of e) t.flex > 0 && !n.has(t) && t.base > a * t.flex && (n.add(t), o = !0);
		if (!o) return a;
	}
}
//#endregion
//#region packages/core/src/layout/FlexDirection.ts
var J = /* @__PURE__ */ function(e) {
	return e[e.Row = 0] = "Row", e[e.Column = 1] = "Column", e;
}({});
function Ul(e) {
	if (e === "row" || e === "horizontal") return 0;
	if (e === "column" || e === "vertical") return 1;
}
//#endregion
//#region packages/core/src/layout/CustomLayout.ts
function Wl(e) {
	return typeof e == "object" && !!e && typeof e.name == "string" && typeof e.layout == "function";
}
//#endregion
//#region packages/core/src/layout/LayoutTypes.ts
var Y = class e {
	minWidth;
	maxWidth;
	minHeight;
	maxHeight;
	constructor(e = 0, t = Infinity, n = 0, r = Infinity) {
		this.minWidth = e, this.maxWidth = t, this.minHeight = n, this.maxHeight = r;
	}
	static unbounded() {
		return new e();
	}
	static tight(t, n) {
		return new e(t, t, n, n);
	}
	static loose(t, n) {
		return new e(0, t, 0, n);
	}
	hasBoundedWidth() {
		return isFinite(this.maxWidth);
	}
	hasBoundedHeight() {
		return isFinite(this.maxHeight);
	}
};
function Gl(e, t) {
	return e.minWidth === t.minWidth && e.maxWidth === t.maxWidth && e.minHeight === t.minHeight && e.maxHeight === t.maxHeight;
}
//#endregion
//#region packages/core/src/layout/LayoutRecord.ts
var Kl = Y.unbounded(), ql = class {
	node;
	constructor(e) {
		this.node = e;
	}
	x = 0;
	y = 0;
	width = 0;
	height = 0;
	measuredWidth = 0;
	measuredHeight = 0;
	outerWidth = 0;
	outerHeight = 0;
	paddingLeft = 0;
	paddingRight = 0;
	paddingTop = 0;
	paddingBottom = 0;
	marginLeft = 0;
	marginRight = 0;
	marginTop = 0;
	marginBottom = 0;
	minWidth = 0;
	maxWidth = Infinity;
	minHeight = 0;
	maxHeight = Infinity;
	flexGrow = 0;
	flexShrink = 1;
	flexBasisZero = !1;
	minWidthAuto = !0;
	minHeightAuto = !0;
	marginLeftAuto = !1;
	marginRightAuto = !1;
	marginTopAuto = !1;
	marginBottomAuto = !1;
	aspectRatio = void 0;
	hasBaseline = !1;
	baseline = 0;
	minContentWidth = 0;
	minContentHeight = 0;
	maxContentWidth = 0;
	intrinsicWidth = 0;
	intrinsicHeight = 0;
	flexMain = 0;
	flexBase = 0;
	flexMin = 0;
	flexMax = Infinity;
	flexMinAuto = !1;
	positioned = !1;
	absolute = !1;
	top = void 0;
	right = void 0;
	bottom = void 0;
	left = void 0;
	zIndex = 0;
	lifted = !1;
	liftBoundary = !1;
	clips = !1;
	scrollable = !1;
	mirrored = !1;
	sticky = !1;
	stickyOffsetX = 0;
	stickyOffsetY = 0;
	scrollbarVisibleUntil = 0;
	subgridColumns = void 0;
	subgridColumnGap = 0;
	paintOrder = null;
	boundsMinX = 0;
	boundsMinY = 0;
	boundsMaxX = 0;
	boundsMaxY = 0;
	boundsUnbounded = !0;
	scrollX = 0;
	scrollY = 0;
	contentWidth = 0;
	contentHeight = 0;
	lastConstraints = Kl;
	altValid = !1;
	altConstraints = Kl;
	altMeasuredWidth = 0;
	altMeasuredHeight = 0;
	altOuterWidth = 0;
	altOuterHeight = 0;
	altMinContentWidth = 0;
	altMinContentHeight = 0;
	altMaxContentWidth = 0;
	altIntrinsicWidth = 0;
	altIntrinsicHeight = 0;
	altHasBaseline = !1;
	altBaseline = 0;
	altContentWidth = 0;
	altContentHeight = 0;
	saveAlt() {
		this.altValid = !0, this.altConstraints = this.lastConstraints, this.altMeasuredWidth = this.measuredWidth, this.altMeasuredHeight = this.measuredHeight, this.altOuterWidth = this.outerWidth, this.altOuterHeight = this.outerHeight, this.altMinContentWidth = this.minContentWidth, this.altMinContentHeight = this.minContentHeight, this.altMaxContentWidth = this.maxContentWidth, this.altIntrinsicWidth = this.intrinsicWidth, this.altIntrinsicHeight = this.intrinsicHeight, this.altHasBaseline = this.hasBaseline, this.altBaseline = this.baseline, this.altContentWidth = this.contentWidth, this.altContentHeight = this.contentHeight;
	}
	swapAlt() {
		let e = this.lastConstraints;
		this.lastConstraints = this.altConstraints, this.altConstraints = e;
		let t = this.measuredWidth;
		this.measuredWidth = this.altMeasuredWidth, this.altMeasuredWidth = t, t = this.measuredHeight, this.measuredHeight = this.altMeasuredHeight, this.altMeasuredHeight = t, t = this.outerWidth, this.outerWidth = this.altOuterWidth, this.altOuterWidth = t, t = this.outerHeight, this.outerHeight = this.altOuterHeight, this.altOuterHeight = t, t = this.minContentWidth, this.minContentWidth = this.altMinContentWidth, this.altMinContentWidth = t, t = this.minContentHeight, this.minContentHeight = this.altMinContentHeight, this.altMinContentHeight = t, t = this.maxContentWidth, this.maxContentWidth = this.altMaxContentWidth, this.altMaxContentWidth = t, t = this.intrinsicWidth, this.intrinsicWidth = this.altIntrinsicWidth, this.altIntrinsicWidth = t, t = this.intrinsicHeight, this.intrinsicHeight = this.altIntrinsicHeight, this.altIntrinsicHeight = t;
		let n = this.hasBaseline;
		this.hasBaseline = this.altHasBaseline, this.altHasBaseline = n, t = this.baseline, this.baseline = this.altBaseline, this.altBaseline = t, t = this.contentWidth, this.contentWidth = this.altContentWidth, this.altContentWidth = t, t = this.contentHeight, this.contentHeight = this.altContentHeight, this.altContentHeight = t;
	}
	contentMatters = !0;
	relayoutBoundary = !1;
	measureDirty = !0;
	placeDirty = !0;
	transformDirty = !1;
	propsPass = 0;
	propsBaseWidth = void 0;
	propsBaseHeight = void 0;
	reset() {
		this.x = 0, this.y = 0, this.width = 0, this.height = 0, this.measuredWidth = 0, this.measuredHeight = 0, this.outerWidth = 0, this.outerHeight = 0, this.paddingLeft = 0, this.paddingRight = 0, this.paddingTop = 0, this.paddingBottom = 0, this.marginLeft = 0, this.marginRight = 0, this.marginTop = 0, this.marginBottom = 0, this.minWidth = 0, this.maxWidth = Infinity, this.minHeight = 0, this.maxHeight = Infinity, this.flexGrow = 0, this.flexShrink = 1, this.flexBasisZero = !1, this.minWidthAuto = !0, this.minHeightAuto = !0, this.marginLeftAuto = !1, this.marginRightAuto = !1, this.marginTopAuto = !1, this.marginBottomAuto = !1, this.aspectRatio = void 0, this.hasBaseline = !1, this.baseline = 0, this.minContentWidth = 0, this.minContentHeight = 0, this.maxContentWidth = 0, this.intrinsicWidth = 0, this.intrinsicHeight = 0, this.flexMain = 0, this.flexBase = 0, this.flexMin = 0, this.flexMax = Infinity, this.flexMinAuto = !1, this.positioned = !1, this.absolute = !1, this.top = void 0, this.right = void 0, this.bottom = void 0, this.left = void 0, this.zIndex = 0, this.lifted = !1, this.liftBoundary = !1, this.clips = !1, this.scrollable = !1, this.mirrored = !1, this.sticky = !1, this.stickyOffsetX = 0, this.stickyOffsetY = 0, this.scrollbarVisibleUntil = 0, this.subgridColumns = void 0, this.subgridColumnGap = 0, this.paintOrder = null, this.boundsMinX = 0, this.boundsMinY = 0, this.boundsMaxX = 0, this.boundsMaxY = 0, this.boundsUnbounded = !0, this.scrollX = 0, this.scrollY = 0, this.contentWidth = 0, this.contentHeight = 0, this.lastConstraints = Kl, this.altValid = !1, this.altConstraints = Kl, this.altMeasuredWidth = 0, this.altMeasuredHeight = 0, this.altOuterWidth = 0, this.altOuterHeight = 0, this.altMinContentWidth = 0, this.altMinContentHeight = 0, this.altMaxContentWidth = 0, this.altIntrinsicWidth = 0, this.altIntrinsicHeight = 0, this.altHasBaseline = !1, this.altBaseline = 0, this.altContentWidth = 0, this.altContentHeight = 0, this.contentMatters = !0, this.relayoutBoundary = !1, this.measureDirty = !0, this.placeDirty = !0, this.transformDirty = !1, this.propsPass = 0, this.propsBaseWidth = void 0, this.propsBaseHeight = void 0;
	}
};
//#endregion
//#region packages/core/src/layout/SubtreeBounds.ts
function Jl(e, t) {
	Yl(e, t);
}
function Yl(e, t) {
	let n = t.get(e);
	return n === void 0 ? null : (n.boundsMinX = n.x, n.boundsMinY = n.y, n.boundsMaxX = n.x + n.width, n.boundsMaxY = n.y + n.height, n.boundsUnbounded = Ql(e, n), Xl(e, n.paintOrder, t, n.clips ? null : n), n);
}
function Xl(e, t, n, r) {
	if (t !== null) {
		for (let e = 0; e < t.length; e++) Zl(r, Yl(t[e], n));
		return;
	}
	for (let t = e.firstChild; t !== null; t = t.nextSibling) t.type === A.Fragment ? Xl(t, null, n, r) : Zl(r, Yl(t, n));
}
function Zl(e, t) {
	if (e !== null && t !== null) {
		if (t.boundsUnbounded) {
			e.boundsUnbounded = !0;
			return;
		}
		t.boundsMinX < e.boundsMinX && (e.boundsMinX = t.boundsMinX), t.boundsMinY < e.boundsMinY && (e.boundsMinY = t.boundsMinY), t.boundsMaxX > e.boundsMaxX && (e.boundsMaxX = t.boundsMaxX), t.boundsMaxY > e.boundsMaxY && (e.boundsMaxY = t.boundsMaxY);
	}
}
function Ql(e, t) {
	if (t.sticky) return !0;
	let n = e.properties.get("transform");
	return typeof n == "object" && !!n;
}
//#endregion
//#region packages/core/src/layout/LayoutTransform.ts
function $l(e, t, n) {
	let r = t.get(e);
	if (r === void 0) {
		n.x = 0, n.y = 0;
		return;
	}
	n.x = r.x, n.y = r.y;
}
//#endregion
//#region packages/core/src/layout/LayoutExplanation.ts
var X = 1e-6;
function eu(e) {
	let t = [], n = "content", r = (e) => Z(e), i = e.axis === "width" ? "minWidth" : "minHeight", a = e.axis === "width" ? "maxWidth" : "maxHeight", o = e.parentMin === e.parentMax && isFinite(e.parentMax);
	if (e.customParent !== void 0 && !e.isRoot) return n = "custom", t.push(`the '${e.customParent}' layout on ${e.parentLabel} measured it at ${r(e.measured)}`), Math.abs(e.final - e.measured) > X && t.push(`and placed it at ${r(e.final)}`), {
		axis: e.axis,
		content: e.content,
		measured: e.measured,
		final: e.final,
		decidedBy: n,
		reasons: t
	};
	if (e.isRoot) e.explicit === void 0 ? isFinite(e.parentMax) ? (n = "viewport", t.push(`the layout root fills its viewport: ${r(e.parentMax)}`)) : t.push(`the layout root is unbounded here and takes its content ${e.axis}: ${r(e.content)}`) : (n = "explicit", t.push(`${e.axis}: ${au(e.explicitRaw)} (explicit) → ${r(e.explicit)}`));
	else if (o) {
		if (e.flex !== void 0 && !e.flex.scroller) n = tu(e, e.flex, t);
		else if (e.inset) {
			n = "inset";
			let i = e.axis === "width" ? "left and right" : "top and bottom";
			t.push(`both ${i} are set, so the containing block decides the ${e.axis}: ${r(e.parentMin)}`);
		} else e.gridArea ? (n = "stretch", t.push(`stretched across its grid area: ${r(e.parentMin)}`)) : e.stretched ? (n = "stretch", t.push(`stretched across ${e.parentLabel}: ${r(e.parentMin)}`)) : (n = "parent", t.push(`${e.parentLabel} fixed the ${e.axis} at ${r(e.parentMin)}`));
		if (e.effectiveMin !== e.parentMin) {
			let n = e.effectiveMin > e.parentMin ? i : a, o = e.effectiveMin > e.parentMin ? e.ownMin : e.ownMax;
			t.push(`clamped by its own ${n} ${r(o ?? e.effectiveMin)} → ${r(e.effectiveMin)}`);
		}
		e.content > e.effectiveMin + X && t.push(`its content would need ${r(e.content)}; the extra ${r(e.content - e.effectiveMin)} ${e.clipsContent ? "is clipped" : "overflows"}`);
	} else if (e.explicit !== void 0) {
		if (n = "explicit", t.push(`${e.axis}: ${au(e.explicitRaw)} (explicit) → ${r(e.explicit)}`), e.flex !== void 0 && !e.flex.scroller && t.push(nu(e.flex)), e.effectiveMin !== e.explicit) {
			let n = e.effectiveMin > e.explicit ? i : a, o = e.effectiveMin > e.explicit ? e.ownMin : e.ownMax;
			t.push(`clamped by ${n} ${r(o ?? e.effectiveMin)} → ${r(e.effectiveMin)}`);
		}
		isFinite(e.parentMax) && e.effectiveMin > e.parentMax + X && t.push(`wider than the ${r(e.parentMax)} available: it overflows ${e.parentLabel}`);
	} else t.push(iu(e)), e.flex !== void 0 && !e.flex.scroller && t.push(nu(e.flex)), e.aspectRatio !== void 0 && Math.abs(e.content - e.measured) > X && (n = "aspect-ratio", t.push(`aspectRatio ${Z(e.aspectRatio)} derives it from the other axis → ${r(e.measured)}`)), e.content < e.effectiveMin - X ? e.ownMin !== void 0 && e.ownMin >= e.effectiveMin - X ? (n = "min", t.push(`raised to ${i} ${r(e.ownMin)}`)) : (n = "min", t.push(`raised to the minimum ${e.parentLabel} asked for: ${r(e.parentMin)}`)) : e.ownMax !== void 0 && e.content > e.ownMax + X && e.measured <= e.ownMax + X && (n = "max", t.push(`capped by ${a} ${r(e.ownMax)}`)), isFinite(e.parentMax) && e.measured > e.parentMax + X && t.push(`the ${r(e.parentMax)} available was only a bound, not a size: the extra ${r(e.measured - e.parentMax)} ${e.clipsContent ? "is clipped" : "overflows"} ${e.parentLabel}`);
	return Math.abs(e.final - e.measured) > X && t.push(`placed at ${r(e.final)} by ${e.parentLabel} (measured ${r(e.measured)})`), {
		axis: e.axis,
		content: e.content,
		measured: e.measured,
		final: e.final,
		decidedBy: n,
		reasons: t
	};
}
function tu(e, t, n) {
	let r = Z, i = e.parentMin, a = i > t.base + X, o = i < t.base - X;
	if (!a && !o) return e.explicit === void 0 ? t.basis === void 0 ? (n.push(`its max-content ${e.axis} is ${r(t.base)}`), n.push(nu(t)), "content") : (n.push(`flexBasis ${r(t.basis)} → ${r(t.base)}`), n.push(nu(t)), "flex") : (n.push(`${e.axis}: ${au(e.explicitRaw)} (explicit) → ${r(e.explicit)}`), n.push(nu(t)), "explicit");
	let s = e.explicit === void 0 ? t.basis === void 0 ? `its max-content ${e.axis}` : `flexBasis ${r(t.basis)}` : `${e.axis}: ${au(e.explicitRaw)}`;
	return n.push(`flex item of ${t.containerLabel}: base ${r(t.base)} from ${s}`), a ? (n.push(`grew to ${r(i)} (flexGrow ${r(t.grow)} takes a share of the free space)`), Math.abs(i - t.max) < X && isFinite(t.max) && n.push(`stopped at ${e.axis === "width" ? "maxWidth" : "maxHeight"} ${r(t.max)}`)) : (n.push(`shrank to ${r(i)} (flexShrink ${r(t.shrink)}: the items' base sizes exceed the content box of ${t.containerLabel}, so they give up space)`), Math.abs(i - t.min) < X && n.push(ru(e, t))), "flex";
}
function nu(e) {
	let t = e.grow === 0 ? " (flexGrow 0, so free space goes to others)" : " (no free space to take)";
	return `flex item of ${e.containerLabel}: kept its base ${Z(e.base)}${t}`;
}
function ru(e, t) {
	let n = Z, r = e.axis === "width" ? "minWidth" : "minHeight";
	return t.minAuto ? t.min === 0 && e.clipsContent ? "its automatic minimum is 0: a scroll container or clipped text has none, so it may shrink to nothing" : t.min === 0 && e.contentMin === 0 ? `its automatic minimum is 0: the content has no minimum ${e.axis}` : e.explicit !== void 0 && Math.abs(t.min - e.explicit) < X ? `stopped at its automatic minimum ${n(t.min)}, its explicit ${e.axis} (set ${r}: 0 to allow smaller)` : `stopped at its automatic minimum ${n(t.min)} (the content's min-content ${e.axis}; set ${r}: 0 to allow smaller)` : `stopped at ${r} ${n(t.min)}`;
}
function iu(e) {
	let t = Z, n = Math.max(0, e.content - e.padding), r = e.padding > 0 ? ` + padding ${t(e.padding)}` : "";
	return e.isText ? `text needs ${t(n)}${r} → ${t(e.content)}` : e.childCount === 0 ? e.content === 0 ? `no content and no ${e.axis}: 0` : `no children${r} → ${t(e.content)}` : `${e.childCount} child${e.childCount === 1 ? "" : "ren"} need ${t(n)}${r} → ${t(e.content)}`;
}
function au(e) {
	return typeof e == "number" ? Z(e) : Lr(e) ? `${Z(e.value)}%` : Ir(e) ? "auto" : e === void 0 ? "unset" : JSON.stringify(e);
}
function Z(e) {
	if (!isFinite(e)) return e > 0 ? "∞" : "-∞";
	let t = Math.round(e * 100) / 100;
	return String(t);
}
function ou(e) {
	return `width ${su(e.minWidth, e.maxWidth)} · height ${su(e.minHeight, e.maxHeight)}`;
}
function su(e, t) {
	return e === t ? `${Z(e)} (tight)` : `[${Z(e)}, ${Z(t)}${isFinite(t) ? "]" : ")"}`;
}
function cu(e) {
	return e.top === e.right && e.right === e.bottom && e.bottom === e.left ? Z(e.top) : [
		e.top,
		e.right,
		e.bottom,
		e.left
	].map(Z).join(" ");
}
function lu(e) {
	if (e.overrides === null || e.overrides.size === 0) return;
	let t = {};
	for (let [n, r] of e.overrides) {
		if (r.entries.length === 0) continue;
		let e = r.entries.map((e) => e.name);
		t[n] = `${e.length === 1 ? `set by ${e[0]}` : `set by ${e.join(", then ")}`} (${r.declared.present ? `declared ${au(r.declared.value)}` : "the element declared none"})`;
	}
	return Object.keys(t).length === 0 ? void 0 : t;
}
function uu(e, t) {
	return t === void 0 ? e : {
		...e,
		reasons: [...e.reasons, t]
	};
}
function du(e) {
	return `${e.type} '${e.id}'`;
}
function fu(e) {
	let { node: t } = e;
	if (!e.laidOut) return `${du(t)} has no layout: ${e.notLaidOutReason ?? "it has not been measured"}.`;
	let { box: n, width: r, height: i, relayout: a, state: o } = e, s = [];
	if (s.push(`${du(t)} · ${Z(n.width)} × ${Z(n.height)} at (${Z(n.x)}, ${Z(n.y)})`), s.push(`width  ${Z(r.final).padEnd(7)} ${r.reasons.join("; ")}`), s.push(`height ${Z(i.final).padEnd(7)} ${i.reasons.join("; ")}`), e.custom !== void 0) {
		let t = e.custom;
		s.push(`layout '${t.name}' over ${t.children} ${t.children === 1 ? "child" : "children"}` + t.notes.map((e) => `\n  ${e}`).join(""));
	}
	let c = e.parent === null ? "the viewport" : du(e.parent);
	s.push(`constraints from ${c}: ${ou(e.constraints)}`), (e.effective.minWidth !== e.constraints.minWidth || e.effective.maxWidth !== e.constraints.maxWidth || e.effective.minHeight !== e.constraints.minHeight || e.effective.maxHeight !== e.constraints.maxHeight) && s.push(`after own size props: ${ou(e.effective)}`);
	let l = Math.max(0, n.width - e.padding.left - e.padding.right), u = Math.max(0, n.height - e.padding.top - e.padding.bottom);
	if (s.push(`padding ${cu(e.padding)} · margin ${cu(e.margin)} · content box ${Z(l)} × ${Z(u)}`), e.scroll !== void 0) {
		let t = e.scroll;
		s.push(`scroll (${Z(t.scrollX)}, ${Z(t.scrollY)}) of content ${Z(t.contentWidth)} × ${Z(t.contentHeight)}`);
	}
	let d = a.root === t ? "itself (it is the layout root)" : `${a.rootIsLayoutRoot ? "the layout root " : ""}${du(a.root)} (${a.depth} level${a.depth === 1 ? "" : "s"} up)`;
	s.push(`relayout: ${a.boundary ? "boundary" : "not a boundary"} · content ${a.contentMatters ? "matters to the parent" : "stays inside"} · a change here is laid out from ${d}`);
	let f = Object.entries(e.sources ?? {}).filter(([e]) => e !== "width" && e !== "height");
	f.length > 0 && s.push(`overrides: ${f.map(([e, t]) => `${e} ${t}`).join(" · ")}`);
	let p = o.measuredLastPass === void 0 ? "" : o.measuredLastPass ? " · measured in the last pass" : " · not measured in the last pass";
	return s.push(`state: ${o.measureDirty ? "measure dirty" : "measured"} · ${o.placeDirty ? "place dirty" : "placed"} · position ${o.position}${o.clips ? " · clips" : ""}${p}`), s.join("\n");
}
//#endregion
//#region packages/core/src/layout/LayoutEngine.ts
var pu = 1200, mu = 4, hu = [];
function gu(e) {
	return e.has("paddingStart") || e.has("paddingEnd") || e.has("marginStart") || e.has("marginEnd");
}
var _u = class {
	protocol;
	constraints;
	placement;
	context;
	measureChild;
	assign;
	handles = [];
	nodes = [];
	live = !1;
	widestChild = 0;
	constructor(e, t, n, r, i, a) {
		this.protocol = e, this.constraints = t, this.placement = n, this.context = r, this.measureChild = i, this.assign = a;
	}
	add(e, t) {
		this.nodes.push(e), this.handles.push(new vu(this.handles.length, t, this));
	}
	execute() {
		this.live = !0;
		let e;
		try {
			e = this.protocol.layout(this.handles, this.constraints, this.context);
		} finally {
			this.live = !1;
		}
		for (let e = 0; e < this.handles.length; e++) {
			let t = this.handles[e];
			if (t.measures === 0) {
				this.live = !0;
				try {
					t.measure(new Y(0, this.constraints.maxWidth, 0, this.constraints.maxHeight));
				} finally {
					this.live = !1;
				}
			}
			this.placement !== null && t.position === null && this.put(t, 0, 0);
		}
		if (!Number.isFinite(e.width) || !Number.isFinite(e.height)) throw Error(`The '${this.protocol.name}' layout returned ${e.width} × ${e.height}.`);
		return {
			width: Math.max(0, e.width),
			height: Math.max(0, e.height)
		};
	}
	runMeasure(e, t) {
		if (this.assertLive("measure"), e.measures >= 2) throw Error(`The '${this.protocol.name}' layout measured child ${e.index} more than 2 times in one pass. Measuring a child inside a loop over the others is what makes a layout quadratic; measure each child once, then arrange them from the sizes you have.`);
		e.measures++;
		let n = this.measureChild(this.nodes[e.index], t);
		return this.widestChild = Math.max(this.widestChild, n.width), n;
	}
	runPlace(e, t, n) {
		if (this.assertLive("place"), !Number.isFinite(t) || !Number.isFinite(n)) throw Error(`The '${this.protocol.name}' layout placed child ${e.index} at (${t}, ${n}).`);
		this.placement === null ? e.position = {
			start: t,
			top: n
		} : this.put(e, t, n);
	}
	put(e, t, n) {
		let r = this.placement;
		e.position = {
			start: t,
			top: n
		};
		let i = r.mirrored ? r.x + r.width - t - e.size.width : r.x + t;
		this.assign(this.nodes[e.index], i, r.y + n, e.size);
	}
	assertLive(e) {
		if (!this.live) throw Error(`The '${this.protocol.name}' layout tried to ${e} a child outside its own layout call. A child handle is valid only for the call it was given to.`);
	}
}, vu = class {
	index;
	data;
	run;
	size = {
		width: 0,
		height: 0
	};
	position = null;
	measures = 0;
	constructor(e, t, n) {
		this.index = e, this.data = t, this.run = n;
	}
	measure(e) {
		return this.size = this.run.runMeasure(this, e), this.size;
	}
	place(e, t) {
		this.run.runPlace(this, e, t);
	}
};
function yu(e) {
	return e === G.Start ? G.End : e === G.End ? G.Start : e;
}
var bu = class {
	records = /* @__PURE__ */ new Map();
	retiredRecords = /* @__PURE__ */ new Map();
	scrollNodes = /* @__PURE__ */ new Set();
	textScrollNodes = /* @__PURE__ */ new Set();
	anchoredNodes = /* @__PURE__ */ new Set();
	anchorOf = /* @__PURE__ */ new Map();
	anchorDependents = /* @__PURE__ */ new Map();
	movedAnchored = /* @__PURE__ */ new Set();
	liftedNodes = /* @__PURE__ */ new Set();
	stickyNodes = /* @__PURE__ */ new Set();
	stickyShifted = /* @__PURE__ */ new Set();
	textMeasurer;
	percentBase = {
		width: void 0,
		height: void 0
	};
	layoutPass = 0;
	layoutRoot = null;
	rootConstraints = Y.unbounded();
	layoutVersion = 0;
	boundsVersion = -1;
	constructor(e = new xc()) {
		this.textMeasurer = e;
	}
	recordFor(e) {
		return this.records.get(e);
	}
	subtreeBoundsFor(e) {
		return this.boundsVersion !== this.layoutVersion && (this.boundsVersion = this.layoutVersion, this.layoutRoot !== null && Jl(this.layoutRoot, this.records)), this.records.get(e);
	}
	get root() {
		return this.layoutRoot;
	}
	explain(e) {
		let t = this.records.get(e), n = this.flowParentOf(e), r = e === this.layoutRoot ? null : n;
		if (t === void 0) return this.unexplained(e, r);
		let i = e === this.layoutRoot, a = t.absolute && !i, o = r === null ? void 0 : this.records.get(r), s = a ? this.containingBlockOf(e) : void 0, c = this.percentBase;
		this.percentBase = s === void 0 ? o === void 0 ? this.rootPercentBase(this.rootConstraints) : {
			width: Math.max(0, o.width - o.paddingLeft - o.paddingRight),
			height: Math.max(0, o.height - o.paddingTop - o.paddingBottom)
		} : {
			width: s.width,
			height: s.height
		};
		let l = t.lastConstraints, u = this.effectiveConstraints(e, l, void 0), d = r === null ? "the viewport" : du(r), f = t.clips || e.properties.get("textOverflow") === "ellipsis" || this.numberProp(e, "maxLines") !== void 0, p = e.type === A.Text || e.type === A.Button || e.type === A.EditableText, m = 0;
		this.forEachLayoutChild(e, () => m++);
		let h = r === null || a ? void 0 : r.properties.get("layout"), g = Wl(h) ? h.name : void 0, _ = r !== null && !a && (r.type === A.Row || r.type === A.Column || r.type === A.ScrollView), v = (n) => {
			if (!(!_ || t.flexMain !== (n === "width" ? 1 : 2))) return {
				base: t.flexBase,
				min: t.flexMin,
				max: t.flexMax,
				minAuto: t.flexMinAuto,
				grow: t.flexGrow,
				shrink: t.flexShrink,
				basis: this.flexBasis(e, t, n === "width" ? this.percentBase.width : this.percentBase.height),
				containerLabel: d,
				scroller: r.type === A.ScrollView
			};
		}, y = (n) => {
			let o = n === "width", s = o ? this.percentBase.width : this.percentBase.height, c = this.lengthProp(e, n, s), h = v(n), _ = o ? l.minWidth : l.minHeight, y = o ? l.maxWidth : l.maxHeight, b = _ === y && isFinite(y), x = a && (o ? t.left !== void 0 && t.right !== void 0 : t.top !== void 0 && t.bottom !== void 0) && c === void 0;
			return {
				axis: n,
				isRoot: i,
				parentLabel: d,
				parentMin: _,
				parentMax: y,
				effectiveMin: o ? u.minWidth : u.minHeight,
				effectiveMax: o ? u.maxWidth : u.maxHeight,
				explicit: c,
				explicitRaw: e.properties.get(n),
				ownMin: this.lengthProp(e, o ? "minWidth" : "minHeight", s),
				ownMax: this.lengthProp(e, o ? "maxWidth" : "maxHeight", s),
				content: o ? t.intrinsicWidth : t.intrinsicHeight,
				measured: o ? t.measuredWidth : t.measuredHeight,
				final: o ? t.width : t.height,
				contentMin: o ? t.minContentWidth : t.minContentHeight,
				padding: o ? t.paddingLeft + t.paddingRight : t.paddingTop + t.paddingBottom,
				aspectRatio: t.aspectRatio,
				flex: h,
				stretched: b && !i && c === void 0 && h === void 0 && !x,
				inset: x,
				gridArea: b && r !== null && r.type === A.Grid && c === void 0,
				customParent: g,
				clipsContent: f,
				isText: p,
				childCount: m
			};
		}, b = lu(e), x = uu(eu(y("width")), b?.width), S = uu(eu(y("height")), b?.height);
		this.percentBase = c;
		let C = t.absolute ? "absolute" : t.sticky ? "sticky" : t.positioned ? "relative" : "static";
		return {
			node: e,
			laidOut: !0,
			parent: r,
			box: {
				x: t.x,
				y: t.y,
				width: t.width,
				height: t.height
			},
			content: {
				width: t.intrinsicWidth,
				height: t.intrinsicHeight
			},
			measured: {
				width: t.measuredWidth,
				height: t.measuredHeight
			},
			constraints: l,
			effective: u,
			padding: {
				top: t.paddingTop,
				right: t.paddingRight,
				bottom: t.paddingBottom,
				left: t.paddingLeft
			},
			margin: {
				top: t.marginTop,
				right: t.marginRight,
				bottom: t.marginBottom,
				left: t.marginLeft
			},
			width: x,
			height: S,
			relayout: this.explainRelayout(e, t),
			state: {
				measureDirty: t.measureDirty,
				placeDirty: t.placeDirty,
				measuredLastPass: this.trace ? this.stats.measuredNodes.includes(e) : void 0,
				position: C,
				clips: t.clips
			},
			scroll: t.scrollable || this.textScrollNodes.has(e) ? {
				scrollX: t.scrollX,
				scrollY: t.scrollY,
				contentWidth: t.contentWidth,
				contentHeight: t.contentHeight
			} : void 0,
			sources: b,
			custom: this.explainCustom(e, t, m)
		};
	}
	explainCustom(e, t, n) {
		let r = e.properties.get("layout");
		if (!Wl(r)) return;
		let i = {
			width: Math.max(0, t.width - t.paddingLeft - t.paddingRight),
			height: Math.max(0, t.height - t.paddingTop - t.paddingBottom)
		};
		if (r.explain === void 0) return {
			name: r.name,
			children: n,
			notes: [`'${r.name}' does not explain itself.`]
		};
		let a = [], o = 0;
		return this.forEachLayoutChild(e, (n) => {
			let s = this.records.get(n);
			a.push({
				index: o++,
				data: n.properties.get("layoutData"),
				size: {
					width: s?.width ?? 0,
					height: s?.height ?? 0
				},
				position: s === void 0 ? null : {
					start: this.startEdge(e) === "right" ? t.x + t.paddingLeft + i.width - s.x - s.width : s.x - t.x - t.paddingLeft,
					top: s.y - t.y - t.paddingTop
				},
				measure() {
					throw Error(`'${r.name}' cannot measure a child from explain().`);
				},
				place() {
					throw Error(`'${r.name}' cannot place a child from explain().`);
				}
			});
		}), {
			name: r.name,
			children: n,
			notes: r.explain(a, i, {
				direction: this.startEdge(e) === "right" ? "rtl" : "ltr",
				definiteWidth: i.width,
				definiteHeight: i.height
			})
		};
	}
	unexplained(e, t) {
		let n;
		n = this.layoutRoot === null ? "nothing has been laid out yet" : this.isFragment(e) ? "fragments are transparent anchors with no box of their own; explain one of its children" : this.isUnderRoot(e) ? this.hiddenAncestor(e) === null ? "it was added after the last layout pass and no frame has run since" : `an ancestor (${du(this.hiddenAncestor(e))}) has not been laid out` : `it is not under the layout root ${du(this.layoutRoot)}`;
		let r = Y.unbounded(), i = {
			width: 0,
			height: 0
		}, a = (e) => ({
			axis: e,
			content: 0,
			measured: 0,
			final: 0,
			decidedBy: "content",
			reasons: []
		});
		return {
			node: e,
			laidOut: !1,
			notLaidOutReason: n,
			parent: t,
			box: {
				x: 0,
				y: 0,
				width: 0,
				height: 0
			},
			content: i,
			measured: i,
			constraints: r,
			effective: r,
			padding: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			},
			margin: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			},
			width: a("width"),
			height: a("height"),
			relayout: {
				boundary: !1,
				contentMatters: !0,
				root: this.layoutRoot ?? e,
				rootIsLayoutRoot: !0,
				depth: this.depthOf(e)
			},
			state: {
				measureDirty: !0,
				placeDirty: !0,
				measuredLastPass: void 0,
				position: "static",
				clips: !1
			}
		};
	}
	explainRelayout(e, t) {
		let n = e, r = 0;
		for (; n !== this.layoutRoot && n.parent !== null;) {
			let t = this.records.get(n);
			if (n !== e && t?.relayoutBoundary && !t.positioned) break;
			n = n.parent, r++;
		}
		return {
			boundary: t.relayoutBoundary,
			contentMatters: t.contentMatters,
			root: n,
			rootIsLayoutRoot: n === this.layoutRoot,
			depth: r
		};
	}
	isUnderRoot(e) {
		for (let t = e; t !== null; t = t.parent) if (t === this.layoutRoot) return !0;
		return !1;
	}
	hiddenAncestor(e) {
		for (let t = e.parent; t !== null; t = t.parent) if (!this.isFragment(t) && !this.records.has(t)) return t;
		return null;
	}
	stats = {
		measured: 0,
		placed: 0,
		relayoutRoots: 0,
		fullLayout: !1,
		measuredNodes: []
	};
	trace = !1;
	relayoutRoots = /* @__PURE__ */ new Set();
	invalidateMeasurements() {
		for (let e of this.records.values()) e.measureDirty = !0, e.placeDirty = !0, e.altValid = !1;
	}
	layout(e, t) {
		this.layoutPass++, this.layoutVersion++, this.layoutRoot = e, this.rootConstraints = t;
		let n = this.records;
		this.records = this.retiredRecords, this.records.size > 0 && this.records.clear(), this.retiredRecords = n, this.liftedNodes.clear(), this.scrollNodes.clear(), this.textScrollNodes.clear(), this.anchorOf.clear(), this.anchorDependents.clear(), this.movedAnchored.clear(), this.resetStats(), this.fullLayout(t);
		let r = this.record(e);
		this.applyScroll();
		for (let e of this.anchoredNodes) this.movedAnchored.add(e);
		this.replaceMovedAnchored(), this.retiredRecords.clear();
		let i = e.type === A.ScrollView;
		return {
			root: e,
			box: {
				x: r.x,
				y: r.y,
				width: r.width,
				height: r.height
			},
			contentWidth: r.contentWidth,
			contentHeight: r.contentHeight,
			scrollX: r.scrollX,
			scrollY: r.scrollY,
			clip: i ? {
				x: r.scrollX,
				y: r.scrollY,
				width: r.width,
				height: r.height
			} : {
				x: 0,
				y: 0,
				width: r.width,
				height: r.height
			}
		};
	}
	layoutForFrame(e, t, n) {
		if (this.layoutPass++, n !== void 0) this.layoutRoot = n, this.rootConstraints = t;
		else if (this.layoutRoot === null) throw Error("LayoutEngine has no layout root. Call layout() first.");
		else this.rootConstraints = t;
		this.resetStats(), this.relayoutRoots.clear();
		let r = !1;
		for (let [t, n] of e.entries()) if ((n & (k.Layout | k.Children | k.SubtreeLayout)) !== 0 && (r = !0, this.markLayoutDirty(t, (n & k.Layout) === 0)), (n & k.Transform) !== 0) {
			let e = t.properties.get("transform");
			typeof e == "object" && e && this.layoutVersion++, this.record(t).transformDirty = !0, (t.type === A.EditableText ? this.textScrollNodes : this.scrollNodes).add(t);
			for (let e of this.anchoredNodes) this.movedAnchored.add(e);
		}
		if (!r) {
			this.applyScroll(), this.replaceMovedAnchored();
			return;
		}
		this.layoutVersion++, this.relayout(t), this.applyScroll(), this.replaceMovedAnchored();
	}
	relayout(e) {
		let t = this.layoutRoot;
		for (;;) {
			if (this.relayoutRoots.has(t)) {
				this.relayoutRoots.clear(), this.fullLayout(e);
				return;
			}
			let n = this.outermostRelayoutRoot();
			if (n === null) return;
			this.relayoutRoots.delete(n), this.relayoutAt(n) || (this.record(n).relayoutBoundary = !1, this.markLayoutDirty(n.parent ?? t, !0));
		}
	}
	fullLayout(e) {
		let t = this.layoutRoot;
		this.stats.fullLayout = !0, this.percentBase = this.rootPercentBase(e);
		let n = this.record(t);
		n.contentMatters = !1, this.measure(t, this.rootMeasureConstraints(t, e));
		let r = this.computeRootBox();
		this.assignBox(t, 0, 0, r.width, r.height), n.placeDirty && this.place(t);
	}
	relayoutAt(e) {
		let t = this.record(e), n = this.flowParentOf(e), r = n === null ? void 0 : this.records.get(n);
		this.percentBase = r === void 0 ? this.rootPercentBase(this.rootConstraints) : {
			width: Math.max(0, r.width - r.paddingLeft - r.paddingRight),
			height: Math.max(0, r.height - r.paddingTop - r.paddingBottom)
		};
		let i = t.width, a = t.height;
		return this.stats.relayoutRoots++, this.measure(e, t.lastConstraints), t.measuredWidth !== i || t.measuredHeight !== a ? !1 : (t.placeDirty = !0, this.place(e), !0);
	}
	outermostRelayoutRoot() {
		let e = null, t = Infinity;
		for (let n of this.relayoutRoots) {
			let r = this.depthOf(n);
			r < t && (e = n, t = r);
		}
		return e;
	}
	depthOf(e) {
		let t = 0;
		for (let n = e.parent; n !== null; n = n.parent) t++;
		return t;
	}
	rootMeasureConstraints(e, t) {
		let n = this.rootPercentBase(t), r = t.hasBoundedWidth() && this.lengthProp(e, "width", n.width) === void 0, i = t.hasBoundedHeight() && this.lengthProp(e, "height", n.height) === void 0;
		return !r && !i ? t : new Y(r ? t.maxWidth : t.minWidth, t.maxWidth, i ? t.maxHeight : t.minHeight, t.maxHeight);
	}
	resetStats() {
		this.stats.measured = 0, this.stats.placed = 0, this.stats.relayoutRoots = 0, this.stats.fullLayout = !1, this.stats.measuredNodes.length = 0;
	}
	clearBoundaries(e) {
		let t = [e];
		for (; t.length > 0;) {
			let e = t.pop(), n = this.records.get(e);
			n !== void 0 && (n.relayoutBoundary = !1, n.contentMatters = !0);
			for (let n = e.firstChild; n !== null; n = n.nextSibling) t.push(n);
		}
	}
	worldBoxTo(e, t) {
		let n = this.records.get(e);
		return n === void 0 ? (t.x = 0, t.y = 0, t.width = 0, t.height = 0, t) : ($l(e, this.records, t), t.width = n.width, t.height = n.height, t);
	}
	worldBox(e) {
		return this.worldBoxTo(e, {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		});
	}
	visibleBox(e) {
		let t = this.records.get(e);
		if (t === void 0) return {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		};
		let n = t.x + t.stickyOffsetX, r = t.y + t.stickyOffsetY;
		for (let t = e.parent; t !== null; t = t.parent) {
			let e = this.records.get(t);
			e !== void 0 && (n += e.stickyOffsetX, r += e.stickyOffsetY, e.scrollable && (n -= e.scrollX, r -= e.scrollY));
		}
		return {
			x: n,
			y: r,
			width: t.width,
			height: t.height
		};
	}
	revealAdjustments(e, t = 0, n) {
		let r = this.records.get(e);
		if (r === void 0) return [];
		let i = r.x + (n?.x ?? 0), a = r.y + (n?.y ?? 0), o = n?.width ?? r.width, s = n?.height ?? r.height, c = [], l = 0, u = 0;
		if (n !== void 0 && this.textScrollNodes.has(e)) {
			let n = this.textScrollAdjustment(r, i, a, o, s, t);
			(n.scrollX !== r.scrollX || n.scrollY !== r.scrollY) && c.push({
				container: e,
				scrollX: n.scrollX,
				scrollY: n.scrollY
			}), l = n.scrollX, u = n.scrollY;
		}
		for (let n = e.parent; n !== null; n = n.parent) {
			let e = this.records.get(n);
			if (e === void 0 || !e.scrollable) continue;
			let r = i - l - t, d = i + o - l + t, f = a - u - t, p = a + s - u + t, m = e.x + e.scrollX, h = e.y + e.scrollY, g = e.scrollX, _ = e.scrollY;
			r < m ? g -= m - r : d > m + e.width && (g += d - (m + e.width)), f < h ? _ -= h - f : p > h + e.height && (_ += p - (h + e.height)), g = this.clamp(g, 0, Math.max(0, e.contentWidth - e.width)), _ = this.clamp(_, 0, Math.max(0, e.contentHeight - e.height)), (g !== e.scrollX || _ !== e.scrollY) && c.push({
				container: n,
				scrollX: g,
				scrollY: _
			}), l += g, u += _;
		}
		return c;
	}
	textScrollAdjustment(e, t, n, r, i, a) {
		let o = e.x + e.paddingLeft + e.scrollX, s = e.y + e.paddingTop + e.scrollY, c = Math.max(0, e.width - e.paddingLeft - e.paddingRight), l = Math.max(0, e.height - e.paddingTop - e.paddingBottom), u = t - a, d = t + r + a, f = n - a, p = n + i + a, m = e.scrollX, h = e.scrollY;
		return u < o ? m -= o - u : d > o + c && (m += d - (o + c)), f < s ? h -= s - f : p > s + l && (h += p - (s + l)), {
			scrollX: Math.max(0, m),
			scrollY: Math.max(0, h)
		};
	}
	revealScrollbars(e) {
		let t = this.records.get(e);
		t !== void 0 && (t.scrollbarVisibleUntil = this.now() + pu);
	}
	scrollContainers() {
		return this.scrollNodes;
	}
	nextScrollbarChange(e) {
		let t;
		for (let n of this.scrollNodes) {
			let r = this.records.get(n);
			if (r === void 0 || !r.scrollable || r.scrollbarVisibleUntil <= e || r.contentWidth <= r.width && r.contentHeight <= r.height) continue;
			let i = r.scrollbarVisibleUntil - 350, a = e < i ? i : e + 16;
			t = t === void 0 ? a : Math.min(t, a);
		}
		return t;
	}
	contentWindow(e) {
		let t = this.records.get(e);
		return t === void 0 ? {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		} : {
			x: t.scrollX,
			y: t.scrollY,
			width: t.width,
			height: t.height
		};
	}
	detachNode(e) {
		let t = [e];
		for (; t.length > 0;) {
			let e = t.pop();
			this.records.delete(e), this.retiredRecords.delete(e), this.liftedNodes.delete(e), this.scrollNodes.delete(e), this.textScrollNodes.delete(e), this.anchoredNodes.delete(e), this.movedAnchored.delete(e), this.forgetAnchoring(e), this.stickyNodes.delete(e), this.stickyShifted.delete(e);
			for (let n = e.firstChild; n !== null; n = n.nextSibling) t.push(n);
		}
	}
	measure(e, t) {
		let n = this.record(e);
		if (this.isFragment(e)) {
			this.forEachLayoutChild(e, (e) => this.measure(e, t)), n.measuredWidth = 0, n.measuredHeight = 0, n.outerWidth = 0, n.outerHeight = 0, n.measureDirty = !1;
			return;
		}
		if (n.measureDirty) n.altValid = !1;
		else {
			if (Gl(n.lastConstraints, t)) return;
			if (n.altValid && Gl(n.altConstraints, t)) {
				n.swapAlt();
				return;
			}
			n.saveAlt();
		}
		this.stats.measured++, this.trace && this.stats.measuredNodes.push(e), n.lastConstraints = t, this.resolveLayoutProps(e, n), n.hasBaseline = !1, n.minContentHeight = -1;
		let r = this.effectiveConstraints(e, t, n), i;
		i = e.type === A.Row || e.type === A.Column || e.type === A.ScrollView || e.hasChildren() ? this.measureContainer(e, n, r) : this.measureLeaf(e, n, r), n.aspectRatio !== void 0 && (i = this.applyAspectRatio(i, n.aspectRatio, r)), n.intrinsicWidth = i.width, n.intrinsicHeight = i.height, n.minContentHeight < 0 && (n.minContentHeight = i.height), n.measuredWidth = r.minWidth === r.maxWidth ? r.minWidth : this.clamp(Math.max(i.width, r.minWidth), n.minWidth, n.maxWidth), n.measuredHeight = r.minHeight === r.maxHeight ? r.minHeight : this.clamp(Math.max(i.height, r.minHeight), n.minHeight, n.maxHeight), n.outerWidth = n.measuredWidth + n.marginLeft + n.marginRight, n.outerHeight = n.measuredHeight + n.marginTop + n.marginBottom, n.measureDirty = !1;
	}
	measureContainer(e, t, n) {
		let r = this.contentConstraints(t, n), i = e.properties.get("layout");
		return Wl(i) ? this.measureCustom(e, t, i, r) : e.type === A.ScrollView ? this.measureScroll(e, t, r) : e.type === A.Row || e.type === A.Column ? this.measureFlex(e, t, r, e.type === A.Row ? J.Row : J.Column) : e.type === A.Grid ? this.measureGrid(e, t, r) : this.measureStack(e, t, r);
	}
	measureGrid(e, t, n) {
		let r = t.paddingLeft + t.paddingRight, i = t.paddingTop + t.paddingBottom, a = this.layoutGrid(e, n, this.definiteAxis(n, "width"), this.definiteAxis(n, "height"));
		t.minContentWidth = r + a.columns.minTotal;
		let o = a.placements[0];
		if (o !== void 0) {
			let e = this.record(o.item);
			t.hasBaseline = !0, t.baseline = t.paddingTop + a.rows.tracks[o.rowStart].offset + e.marginTop + (e.hasBaseline ? e.baseline : e.measuredHeight);
		}
		return {
			width: r + a.columns.total,
			height: i + a.rows.total
		};
	}
	placeGrid(e, t) {
		let n = t.x + t.paddingLeft, r = t.y + t.paddingTop, i = Math.max(0, t.width - t.paddingLeft - t.paddingRight), a = Math.max(0, t.height - t.paddingTop - t.paddingBottom), o = new Y(i, i, a, a), s = this.layoutGrid(e, o, i, a), c = K(e.properties.get("x")) ?? G.Stretch, l = K(e.properties.get("y")) ?? G.Stretch, u = this.startEdge(e) === "right", d = this.percentBase;
		for (let e of s.placements) {
			let t = e.item, a = this.record(t), o = this.gridArea(s, e);
			u && (o.x = i - o.x - o.width), this.percentBase = {
				width: o.width,
				height: o.height
			}, this.resolveLayoutProps(t, a);
			let d = this.stackAlignment(t, "selfX", "width", c, u), f = this.stackAlignment(t, "selfY", "height", l), p = Math.max(0, o.width - a.marginLeft - a.marginRight), m = Math.max(0, o.height - a.marginTop - a.marginBottom);
			this.measure(t, new Y(d === G.Stretch ? p : 0, p, f === G.Stretch ? m : 0, m));
			let h = n + o.x + a.marginLeft + this.stackOffset(d, p, a.measuredWidth, u), g = r + o.y + a.marginTop + this.stackOffset(f, m, a.measuredHeight);
			this.assignBox(t, h, g, a.measuredWidth, a.measuredHeight);
		}
		this.percentBase = d;
	}
	layoutGrid(e, t, n, r) {
		let i = this.trackList(e, "columns"), a = this.trackList(e, "rows"), o = this.trackSize(e, "autoColumns"), s = this.trackSize(e, "autoRows"), c = e.properties.get("autoFlow") === "column" ? "column" : "row", l = this.numberProp(e, "gap") ?? 0, u = this.numberProp(e, "columnGap") ?? l, d = this.numberProp(e, "rowGap") ?? l, f = K(e.properties.get("x")) ?? G.Stretch, p = this.subgridColumns(e), m = p?.tracks.length ?? i.length, h = Fl(this.gridRequests(e, m), m, a.length, c), g = p?.tracks ?? this.fillTracks(i, h.columnCount, o), _ = this.fillTracks(a, h.rowCount, s), v = p?.gap ?? u, y = this.percentBase;
		this.percentBase = {
			width: n,
			height: r
		};
		let b = this.record(e), x = [];
		for (let e of h.placements) {
			let t = this.record(e.item);
			if (this.resolveLayoutProps(e.item, t), this.isSubgrid(e.item)) {
				t.contentMatters = !0, t.relayoutBoundary = !1, this.collectSubgridColumns(e, x);
				continue;
			}
			let n = this.lengthProp(e.item, "width", void 0) !== void 0 && this.lengthProp(e.item, "height", void 0) !== void 0;
			t.contentMatters = b.contentMatters || !n, this.measure(e.item, new Y(0, Infinity, 0, Infinity)), t.relayoutBoundary = n && !t.contentMatters && t.aspectRatio === void 0 && !t.positioned;
			let r = t.marginLeft + t.marginRight, i = {
				min: this.minContentContribution(e.item, t) + r,
				max: t.measuredWidth + r
			};
			x.push({
				start: e.columnStart,
				end: e.columnEnd,
				contribution: i
			});
		}
		let S = Il({
			sizes: g,
			available: n,
			gap: v,
			distribution: Pl(e.properties.get("justifyContent")),
			items: x
		});
		for (let e of h.placements) this.isSubgrid(e.item) && this.publishSubgridTracks(e, S, v);
		let C = h.placements.map((e) => {
			let t = this.record(e.item), n = this.spanExtent(S, e.columnStart, e.columnEnd, v), i = this.stackAlignment(e.item, "selfX", "width", f), a = t.marginLeft + t.marginRight, o = Math.max(0, n - a);
			this.percentBase = {
				width: n,
				height: r
			}, this.measure(e.item, new Y(i === G.Stretch ? o : 0, o, 0, Infinity));
			let s = t.measuredHeight + t.marginTop + t.marginBottom;
			return {
				start: e.rowStart,
				end: e.rowEnd,
				contribution: {
					min: s,
					max: s
				}
			};
		}), w = Il({
			sizes: _,
			available: r,
			gap: d,
			distribution: Pl(e.properties.get("alignContent")),
			items: C
		});
		return this.percentBase = y, {
			columns: S,
			rows: w,
			placements: h.placements
		};
	}
	gridRequests(e, t) {
		let n = [];
		return this.forEachLayoutChild(e, (e) => {
			let r = this.numberProp(e, "columnSpan"), i = r === void 0 && this.isSubgrid(e) ? Math.max(1, t) : Math.max(1, Math.floor(r ?? 1));
			n.push({
				item: e,
				column: this.lineProp(e, "column"),
				row: this.lineProp(e, "row"),
				columnSpan: i,
				rowSpan: Math.max(1, Math.floor(this.numberProp(e, "rowSpan") ?? 1))
			});
		}), n;
	}
	isSubgrid(e) {
		return e.type === A.Grid && e.properties.get("subgrid") === "columns";
	}
	subgridColumns(e) {
		if (!this.isSubgrid(e)) return;
		let t = this.record(e);
		if (t.subgridColumns !== void 0) return {
			tracks: [...t.subgridColumns],
			gap: t.subgridColumnGap
		};
	}
	collectSubgridColumns(e, t) {
		let n = e.columnEnd - e.columnStart, r = Fl(this.gridRequests(e.item, n), n, 0, "row");
		for (let i of r.placements) {
			let r = this.record(i.item);
			this.resolveLayoutProps(i.item, r), r.contentMatters = !0, this.measure(i.item, new Y(0, Infinity, 0, Infinity)), r.relayoutBoundary = !1;
			let a = r.marginLeft + r.marginRight;
			t.push({
				start: e.columnStart + Math.min(i.columnStart, n - 1),
				end: e.columnStart + Math.min(i.columnEnd, n),
				contribution: {
					min: this.minContentContribution(i.item, r) + a,
					max: r.measuredWidth + a
				}
			});
		}
	}
	publishSubgridTracks(e, t, n) {
		let r = this.record(e.item), i = [];
		for (let n = e.columnStart; n < e.columnEnd; n++) i.push(t.tracks[Math.min(n, t.tracks.length - 1)]?.size ?? 0);
		let a = r.subgridColumns;
		(a === void 0 || r.subgridColumnGap !== n || a.length !== i.length || a.some((e, t) => e !== i[t])) && (r.subgridColumns = i, r.subgridColumnGap = n, r.measureDirty = !0, r.placeDirty = !0);
	}
	gridArea(e, t) {
		let n = e.columns.tracks[t.columnStart].offset, r = e.rows.tracks[t.rowStart].offset, i = e.columns.tracks[t.columnEnd - 1], a = e.rows.tracks[t.rowEnd - 1];
		return {
			x: n,
			y: r,
			width: i.offset + i.size - n,
			height: a.offset + a.size - r
		};
	}
	spanExtent(e, t, n, r) {
		if (n <= t || e.tracks.length === 0) return 0;
		let i = e.tracks[Math.min(t, e.tracks.length - 1)], a = e.tracks[Math.min(n - 1, e.tracks.length - 1)];
		return a.offset + a.size - i.offset;
	}
	fillTracks(e, t, n) {
		let r = [...e];
		for (; r.length < t;) r.push(n);
		return r;
	}
	trackList(e, t) {
		let n = e.properties.get(t);
		if (n == null) return [];
		if (!Array.isArray(n)) throw Error(`Property '${t}' must be an array of track sizes (numbers, percent(), auto, fr(), minmax()).`);
		return n;
	}
	trackSize(e, t) {
		return e.properties.get(t) ?? { unit: "auto" };
	}
	lineProp(e, t) {
		let n = this.numberProp(e, t);
		if (n !== void 0) {
			if (!Number.isInteger(n) || n < 1) throw Error(`Property '${t}' must be a positive integer grid line, got ${String(n)}.`);
			return n;
		}
	}
	contentConstraints(e, t) {
		let n = e.paddingLeft + e.paddingRight, r = e.paddingTop + e.paddingBottom;
		return new Y(Math.max(0, t.minWidth - n), Math.max(0, t.maxWidth - n), Math.max(0, t.minHeight - r), Math.max(0, t.maxHeight - r));
	}
	measureFlex(e, t, n, r) {
		let i = r === J.Row, a = i ? t.paddingLeft + t.paddingRight : t.paddingTop + t.paddingBottom, o = i ? t.paddingTop + t.paddingBottom : t.paddingLeft + t.paddingRight, s = this.flexConfig(e, t, r), c = i ? n.minWidth : n.minHeight, l = i ? n.maxWidth : n.maxHeight, u = isFinite(l), d = u && c === l, f = i ? isFinite(n.maxHeight) && n.minHeight === n.maxHeight : isFinite(n.maxWidth) && n.minWidth === n.maxWidth, p = this.collectFlexItems(e, n, r, s, f && !s.wrap);
		if (p.length === 0) return t.minContentWidth = t.paddingLeft + t.paddingRight, t.minContentHeight = t.paddingTop + t.paddingBottom, {
			width: a,
			height: o
		};
		let m = this.breakLines(p, s, u ? l : Infinity), h = 0;
		for (let e of m) {
			let t = this.lineOuterMain(e, s.gapMain, "hypothetical");
			if (u && (d || t > l)) this.resolveLine(e, l - s.gapMain * (e.items.length - 1), s), this.measureFlexedItems(e.items, n, r, f && !s.wrap ? i ? n.maxHeight : n.maxWidth : void 0), h = Math.max(h, this.lineOuterMain(e, s.gapMain, "final"));
			else {
				for (let t of e.items) t.finalMain = t.hypotheticalMain;
				h = Math.max(h, t);
			}
		}
		d && (h = Math.max(l, h)), this.markFlexBoundaries(m);
		let g = 0;
		for (let e of m) e.cross = this.flexLineCross(e.items, i), g += e.cross;
		return g += s.gapLine * (m.length - 1), this.setFlexBaseline(t, m[0].items, i), t.minContentWidth = this.flexMinContentWidth(t, p, i, s), t.minContentHeight = this.flexMinContentHeight(t, p, i, s), {
			width: i ? a + h : o + g,
			height: i ? o + g : a + h
		};
	}
	flexConfig(e, t, n) {
		let r = n === J.Row, i = this.numberProp(e, "gap") ?? 0, a = this.numberProp(e, "rowGap") ?? i, o = this.numberProp(e, "columnGap") ?? i, s = e.properties.get("flexWrap"), c = s === "wrap" || s === "wrap-reverse", l = e.properties.get("direction"), u = typeof l == "string" && l.endsWith("-reverse"), d = Fi(e, "textDirection") === "rtl";
		return {
			row: r,
			isScroll: e.type === A.ScrollView,
			gapMain: r ? o : a,
			gapLine: r ? a : o,
			wrap: c,
			wrapReverse: s === "wrap-reverse" !== (!r && d),
			mainReversed: u !== (r && d),
			crossReversed: !r && d,
			mainAlign: Nl(e.properties.get(r ? "x" : "y")),
			crossAlign: K(e.properties.get(r ? "y" : "x")) ?? G.Stretch,
			alignContent: Pl(e.properties.get("alignContent")),
			paddingMainStart: r ? t.paddingLeft : t.paddingTop,
			paddingCrossStart: r ? t.paddingTop : t.paddingLeft
		};
	}
	collectFlexItems(e, t, n, r, i) {
		let a = n === J.Row, o = this.record(e), s = [], c = this.definiteAxis(t, a ? "width" : "height"), l = this.definiteAxis(t, a ? "height" : "width"), u = this.percentBase;
		return this.percentBase = a ? {
			width: c,
			height: l
		} : {
			width: l,
			height: c
		}, this.forEachLayoutChild(e, (e) => {
			let u = this.record(e);
			this.resolveLayoutProps(e, u);
			let d = K(e.properties.get(a ? "selfY" : "selfX")) ?? r.crossAlign;
			!a && d === G.Baseline && (d = G.Start);
			let f = this.lengthProp(e, a ? "height" : "width", l) !== void 0;
			d === G.Stretch && f && (d = G.Start), r.crossReversed && (d = yu(d)), u.contentMatters = o.contentMatters || d === G.Baseline, this.measure(e, this.flexChildConstraints(u, t, n, d, void 0, i));
			let p = a ? u.measuredWidth : u.measuredHeight, m = this.lengthProp(e, a ? "width" : "height", c), h = a ? u.maxWidth : u.maxHeight, g, _ = !1;
			if (a ? u.minWidthAuto : u.minHeightAuto) {
				let t = e.type === A.ScrollView || e.type === A.EditableText || e.properties.get("textOverflow") === "ellipsis" || this.numberProp(e, "maxLines") !== void 0, n = t ? 0 : a ? u.minContentWidth : u.minContentHeight;
				g = Math.min(n, m ?? Infinity, h), _ = !t && m === void 0;
			} else g = a ? u.minWidth : u.minHeight;
			let v = this.flexBasis(e, u, c), y = v ?? p, b = (m !== void 0 || v !== void 0 && !_) && (f || d === G.Stretch && i) && u.aspectRatio === void 0 && !u.positioned, x = a ? u.marginLeft : u.marginTop, S = a ? u.marginRight : u.marginBottom, C = a ? u.marginLeftAuto : u.marginTopAuto, w = a ? u.marginRightAuto : u.marginBottomAuto;
			u.flexMain = a ? 1 : 2, u.flexBase = y, u.flexMin = g, u.flexMax = h, u.flexMinAuto = a ? u.minWidthAuto : u.minHeightAuto, s.push({
				child: e,
				rec: u,
				baseMain: y,
				hypotheticalMain: this.clamp(y, g, h),
				finalMain: y,
				cross: a ? u.measuredHeight : u.measuredWidth,
				marginMainStart: r.mainReversed ? S : x,
				marginMainEnd: r.mainReversed ? x : S,
				marginCrossStart: a ? u.marginTop : u.marginLeft,
				marginCrossEnd: a ? u.marginBottom : u.marginRight,
				marginMainStartAuto: r.mainReversed ? w : C,
				marginMainEndAuto: r.mainReversed ? C : w,
				marginCrossStartAuto: a ? u.marginTopAuto : u.marginLeftAuto,
				marginCrossEndAuto: a ? u.marginBottomAuto : u.marginRightAuto,
				minMain: g,
				maxMain: h,
				grow: u.flexGrow,
				shrink: u.flexShrink,
				sizeFree: b,
				align: d,
				frozen: !1,
				violation: 0
			});
		}), this.percentBase = u, s;
	}
	markFlexBoundaries(e) {
		for (let t of e) for (let e of t.items) {
			let t = e.finalMain < e.hypotheticalMain - 1e-6;
			t && !e.rec.contentMatters && (e.rec.contentMatters = !0, this.clearBoundaries(e.child)), e.rec.relayoutBoundary = e.sizeFree && !t && !e.rec.contentMatters;
		}
	}
	flexBasis(e, t, n) {
		let r = this.lengthProp(e, "flexBasis", n);
		return r === void 0 ? t.flexBasisZero ? 0 : void 0 : r;
	}
	flexChildConstraints(e, t, n, r, i, a) {
		let o = n === J.Row, s = o ? e.marginTop + e.marginBottom : e.marginLeft + e.marginRight, c = o ? t.maxHeight : t.maxWidth, l = Math.max(0, c - s), u = r === G.Stretch && a, d = i ?? 0, f = i ?? Infinity;
		return o ? new Y(d, f, u ? l : 0, l) : new Y(u ? l : 0, l, d, f);
	}
	breakLines(e, t, n) {
		if (!t.wrap || !isFinite(n)) return [{
			items: e,
			cross: 0,
			crossStart: 0
		}];
		let r = [], i = [], a = 0;
		for (let o of e) {
			let e = o.hypotheticalMain + o.marginMainStart + o.marginMainEnd, s = i.length === 0 ? e : a + t.gapMain + e;
			i.length > 0 && s > n ? (r.push({
				items: i,
				cross: 0,
				crossStart: 0
			}), i = [o], a = e) : (i.push(o), a = s);
		}
		return i.length > 0 && r.push({
			items: i,
			cross: 0,
			crossStart: 0
		}), r;
	}
	lineOuterMain(e, t, n) {
		let r = t * (e.items.length - 1);
		for (let t of e.items) r += (n === "final" ? t.finalMain : t.hypotheticalMain) + t.marginMainStart + t.marginMainEnd;
		return r;
	}
	resolveLine(e, t, n) {
		let r = e.items;
		if (n.isScroll) {
			for (let e of r) e.finalMain = e.hypotheticalMain, e.frozen = !0;
			return 0;
		}
		let i = 0, a = 0;
		for (let e of r) i += e.marginMainStart + e.marginMainEnd, a += e.hypotheticalMain;
		let o = t - i - a > 0;
		for (let e of r) e.frozen = (o ? e.grow : e.shrink) === 0 || o && e.baseMain > e.hypotheticalMain || !o && e.baseMain < e.hypotheticalMain, e.finalMain = e.frozen ? e.hypotheticalMain : e.baseMain;
		for (let e = 0; e <= r.length; e++) {
			let e = 0, n = 0, a = 0, s = 0, c = 0;
			for (let t of r) t.frozen ? e += t.finalMain : (c++, n += t.baseMain, a += o ? t.grow : t.shrink, s += t.shrink * t.baseMain);
			if (c === 0) break;
			let l = t - i - e - n;
			a < 1 && (l *= a);
			let u = 0;
			for (let e of r) {
				if (e.frozen) continue;
				let t = e.baseMain;
				o && a > 0 ? t = e.baseMain + l * e.grow / a : !o && s > 0 && (t = e.baseMain - Math.abs(l) * e.shrink * e.baseMain / s);
				let n = this.clamp(Math.max(0, t), e.minMain, e.maxMain);
				e.finalMain = n, e.violation = n - t, u += e.violation;
			}
			for (let e of r) e.frozen || (u === 0 || u > 0 && e.violation > 0 || u < 0 && e.violation < 0) && (e.frozen = !0);
		}
		let s = i;
		for (let e of r) s += e.finalMain;
		return Math.max(0, t - s);
	}
	measureFlexedItems(e, t, n, r) {
		let i = n === J.Row, a = this.definiteAxis(t, i ? "width" : "height"), o = this.definiteAxis(t, i ? "height" : "width"), s = this.percentBase;
		this.percentBase = i ? {
			width: a,
			height: o
		} : {
			width: o,
			height: a
		};
		for (let a of e) {
			let e = i ? a.rec.measuredWidth : a.rec.measuredHeight, o = a.align === G.Stretch && r !== void 0 && !a.marginCrossStartAuto && !a.marginCrossEndAuto;
			if (a.finalMain === e && !o) continue;
			let s = this.flexChildConstraints(a.rec, t, n, a.align, a.finalMain, !1);
			if (o) {
				let e = Math.max(0, r - a.marginCrossStart - a.marginCrossEnd);
				s = i ? new Y(s.minWidth, s.maxWidth, e, e) : new Y(e, e, s.minHeight, s.maxHeight);
			}
			this.measure(a.child, s), a.cross = i ? a.rec.measuredHeight : a.rec.measuredWidth;
		}
		this.percentBase = s;
	}
	flexLineCross(e, t) {
		let n = 0, r = 0, i = 0;
		for (let a of e) {
			let e = a.cross + a.marginCrossStart + a.marginCrossEnd;
			if (t && a.align === G.Baseline) {
				let t = a.marginCrossStart + this.itemBaseline(a);
				r = Math.max(r, t), i = Math.max(i, e - t);
			} else n = Math.max(n, e);
		}
		return Math.max(n, r + i);
	}
	itemBaseline(e) {
		return e.rec.hasBaseline ? e.rec.baseline : e.cross;
	}
	setFlexBaseline(e, t, n) {
		if (t.length === 0) return;
		if (n) {
			let n = 0, r = !1;
			for (let e of t) e.align === G.Baseline && (n = Math.max(n, e.marginCrossStart + this.itemBaseline(e)), r = !0);
			if (r) {
				e.hasBaseline = !0, e.baseline = e.paddingTop + n;
				return;
			}
		}
		let r = t[0], i = n ? r.marginCrossStart : r.marginMainStart;
		e.hasBaseline = !0, e.baseline = e.paddingTop + i + this.itemBaseline(r);
	}
	flexMinContentWidth(e, t, n, r) {
		let i = 0;
		for (let e of t) {
			let t = this.minContentContribution(e.child, e.rec) + e.rec.marginLeft + e.rec.marginRight;
			i = n && !r.wrap ? i + t : Math.max(i, t);
		}
		return n && !r.wrap && (i += r.gapMain * (t.length - 1)), i + e.paddingLeft + e.paddingRight;
	}
	flexMinContentHeight(e, t, n, r) {
		let i = 0;
		for (let e of t) {
			let t = this.minContentHeightContribution(e.child, e.rec) + e.rec.marginTop + e.rec.marginBottom;
			i = !n && !r.wrap ? i + t : Math.max(i, t);
		}
		return !n && !r.wrap && (i += r.gapMain * (t.length - 1)), i + e.paddingTop + e.paddingBottom;
	}
	minContentContribution(e, t) {
		if (e.type === A.ScrollView || e.type === A.EditableText) return this.lengthProp(e, "width", void 0) ?? t.minWidth;
		let n = this.lengthProp(e, "width", void 0);
		return this.clamp(n ?? t.minContentWidth, t.minWidth, t.maxWidth);
	}
	minContentHeightContribution(e, t) {
		if (e.type === A.ScrollView || e.type === A.EditableText) return this.lengthProp(e, "height", void 0) ?? t.minHeight;
		let n = this.lengthProp(e, "height", void 0);
		return this.clamp(n ?? t.minContentHeight, t.minHeight, t.maxHeight);
	}
	measureStack(e, t, n) {
		let r = 0, i = 0, a = 0, o = 0, s = !0, c = this.percentBase, l = this.definiteAxis(n, "width"), u = this.definiteAxis(n, "height");
		this.percentBase = {
			width: l,
			height: u
		};
		let d = K(e.properties.get("x")) ?? G.Start, f = K(e.properties.get("y")) ?? G.Start;
		return this.forEachLayoutChild(e, (e) => {
			let c = this.record(e);
			this.resolveLayoutProps(e, c);
			let p = this.lengthProp(e, "width", l) !== void 0, m = this.lengthProp(e, "height", u) !== void 0, h = l !== void 0 && this.stackAlignment(e, "selfX", "width", d) === G.Stretch, g = u !== void 0 && this.stackAlignment(e, "selfY", "height", f) === G.Stretch, _ = Math.max(0, n.maxWidth - c.marginLeft - c.marginRight), v = Math.max(0, n.maxHeight - c.marginTop - c.marginBottom);
			c.contentMatters = t.contentMatters, this.measure(e, new Y(h ? _ : 0, h ? _ : n.maxWidth, g ? v : 0, g ? v : n.maxHeight)), c.relayoutBoundary = (p || h) && (m || g) && c.aspectRatio === void 0 && !c.positioned && !c.contentMatters, r = Math.max(r, c.outerWidth), i = Math.max(i, c.outerHeight), a = Math.max(a, this.minContentContribution(e, c) + c.marginLeft + c.marginRight), o = Math.max(o, this.minContentHeightContribution(e, c) + c.marginTop + c.marginBottom), s && (s = !1, t.hasBaseline = !0, t.baseline = t.paddingTop + c.marginTop + (c.hasBaseline ? c.baseline : c.measuredHeight));
		}), this.percentBase = c, t.minContentWidth = t.paddingLeft + t.paddingRight + a, t.minContentHeight = t.paddingTop + t.paddingBottom + o, {
			width: t.paddingLeft + t.paddingRight + r,
			height: t.paddingTop + t.paddingBottom + i
		};
	}
	measureScroll(e, t, n) {
		let r = this.scrollDirection(e) === J.Column, i = this.numberProp(e, "gap") ?? 0, a = r ? t.paddingTop + t.paddingBottom : t.paddingLeft + t.paddingRight, o = r ? t.paddingLeft + t.paddingRight : t.paddingTop + t.paddingBottom, s = 0, c = 0, l = 0, u = this.percentBase, d = this.definiteAxis(n, "width"), f = this.definiteAxis(n, "height");
		this.percentBase = {
			width: d,
			height: f
		};
		let p = r ? d : f, m = K(e.properties.get(r ? "x" : "y")) ?? G.Stretch;
		this.forEachLayoutChild(e, (e) => {
			let t = this.record(e);
			this.resolveLayoutProps(e, t);
			let i = this.lengthProp(e, r ? "height" : "width", r ? f : d), a = this.lengthProp(e, r ? "width" : "height", p) !== void 0, o = K(e.properties.get(r ? "selfX" : "selfY")) ?? m, u = p !== void 0 && o === G.Stretch && !a, h = r ? t.marginLeft + t.marginRight : t.marginTop + t.marginBottom, g = Math.max(0, (r ? n.maxWidth : n.maxHeight) - h), _ = r ? new Y(u ? g : 0, g, 0, Infinity) : new Y(0, Infinity, u ? g : 0, g);
			t.contentMatters = !1, this.measure(e, _), t.relayoutBoundary = i !== void 0 && (a || u) && t.aspectRatio === void 0 && !t.positioned;
			let v = r ? t.measuredHeight : t.measuredWidth, y = r ? t.measuredWidth : t.measuredHeight, b = r ? t.marginTop + t.marginBottom : t.marginLeft + t.marginRight, x = r ? t.marginLeft + t.marginRight : t.marginTop + t.marginBottom;
			s += v + b, c = Math.max(c, y + x), l++;
		}), this.percentBase = u, t.minContentWidth = t.paddingLeft + t.paddingRight, t.minContentHeight = t.paddingTop + t.paddingBottom, s += i * Math.max(0, l - 1);
		let h = s + a, g = c + o;
		t.contentWidth = r ? g : h, t.contentHeight = r ? h : g, this.scrollNodes.add(e);
		let _ = this.lengthProp(e, "width", u.width), v = this.lengthProp(e, "height", u.height);
		return {
			width: _ ?? (n.hasBoundedWidth() ? n.maxWidth : t.contentWidth),
			height: v ?? (n.hasBoundedHeight() ? n.maxHeight : t.contentHeight)
		};
	}
	measureLeaf(e, t, n) {
		let r = t.paddingLeft + t.paddingRight, i = t.paddingTop + t.paddingBottom, a = e.type === A.EditableText;
		if (e.type === A.Text || e.type === A.Button || a) {
			let o = a ? hu : Yn(e), s = a ? U(e).text : o.length > 0 ? Jn(e) : String(e.properties.get("text") ?? ""), c = e.properties.get("placeholder"), l = a && s.length === 0 && typeof c == "string" ? c : void 0, u = Bo(e), d = a ? void 0 : this.numberProp(e, "maxLines"), f = {
				text: s,
				fontSize: u.fontSize,
				fontFamily: u.fontFamily,
				fontWeight: u.fontWeight,
				lineHeight: u.lineHeight,
				letterSpacing: u.letterSpacing,
				fontStyle: u.fontStyle,
				fontStretch: u.fontStretch,
				fontVariant: u.fontVariant,
				fontKerning: u.fontKerning,
				maxWidth: isFinite(n.maxWidth) ? Math.max(0, n.maxWidth - r) : void 0,
				wrap: this.textWrapProp(e),
				maxLines: d !== void 0 && d >= 1 ? Math.floor(d) : void 0,
				overflow: a ? "clip" : this.textOverflowProp(e),
				spans: o.length > 0 ? o : void 0
			}, p = this.textMeasurer.layout(f), m = p.width, h = p.minContentWidth, g = p.maxContentWidth;
			if (l !== void 0 && l.length > 0) {
				let e = this.textMeasurer.layout({
					...f,
					text: l
				});
				m = Math.max(m, e.width), h = Math.max(h, e.minContentWidth), g = Math.max(g, e.maxContentWidth);
			}
			return t.hasBaseline = !0, t.baseline = t.paddingTop + p.firstBaseline, t.minContentWidth = h + r, t.maxContentWidth = g + r, a && (t.contentWidth = m + r, t.contentHeight = p.height + i, this.textScrollNodes.add(e)), {
				width: m + r,
				height: p.height + i
			};
		}
		if (e.type === A.Paint) {
			let n = e.properties.get("paint"), a = n?.intrinsicWidth ?? 0;
			return t.minContentWidth = a + r, t.maxContentWidth = a + r, {
				width: a + r,
				height: (n?.intrinsicHeight ?? 0) + i
			};
		}
		return t.minContentWidth = r, t.maxContentWidth = r, {
			width: r,
			height: i
		};
	}
	measureCustom(e, t, n, r) {
		let i = this.percentBase;
		this.percentBase = {
			width: this.definiteAxis(r, "width"),
			height: this.definiteAxis(r, "height")
		};
		let a = this.customRun(e, t, n, r, null), o;
		try {
			o = a.execute();
		} finally {
			this.percentBase = i;
		}
		let s = t.paddingLeft + t.paddingRight, c = t.paddingTop + t.paddingBottom;
		return t.minContentWidth = s + a.widestChild, t.maxContentWidth = s + o.width, {
			width: s + o.width,
			height: c + o.height
		};
	}
	placeCustom(e, t, n) {
		let r = Math.max(0, t.width - t.paddingLeft - t.paddingRight), i = Math.max(0, t.height - t.paddingTop - t.paddingBottom), a = new Y(r, r, i, i), o = this.percentBase;
		this.percentBase = {
			width: r,
			height: i
		};
		try {
			this.customRun(e, t, n, a, {
				x: t.x + t.paddingLeft,
				y: t.y + t.paddingTop,
				width: r,
				mirrored: this.startEdge(e) === "right"
			}).execute();
		} finally {
			this.percentBase = o;
		}
	}
	customRun(e, t, n, r, i) {
		let a = new _u(n, r, i, {
			direction: this.startEdge(e) === "right" ? "rtl" : "ltr",
			definiteWidth: this.definiteAxis(r, "width"),
			definiteHeight: this.definiteAxis(r, "height")
		}, (e, t) => {
			let n = this.record(e);
			return this.measure(e, t), {
				width: n.measuredWidth,
				height: n.measuredHeight
			};
		}, (e, t, n, r) => this.assignBox(e, t, n, r.width, r.height));
		return this.forEachLayoutChild(e, (e) => {
			let n = this.record(e);
			this.resolveLayoutProps(e, n), n.relayoutBoundary = !1, n.contentMatters = t.contentMatters, a.add(e, e.properties.get("layoutData"));
		}), a;
	}
	place(e) {
		let t = this.record(e);
		if (this.isFragment(e)) {
			t.placeDirty = !1, this.forEachLayoutChild(e, (e) => {
				this.record(e).placeDirty && this.place(e);
			});
			return;
		}
		if (!t.placeDirty || (this.stats.placed++, t.placeDirty = !1, !e.hasChildren())) return;
		let n = e.properties.get("layout");
		Wl(n) ? this.placeCustom(e, t, n) : e.type === A.Row || e.type === A.Column ? this.placeFlex(e, t, e.type === A.Row ? J.Row : J.Column) : e.type === A.ScrollView ? this.placeFlex(e, t, this.scrollDirection(e)) : e.type === A.Grid ? this.placeGrid(e, t) : this.placeStack(e, t), this.placeAbsoluteChildren(e), this.updatePaintOrder(e, t), t.clips && this.updateContentExtent(e, t), t.scrollable && this.scrollNodes.add(e), this.forEachChild(e, (e) => {
			let t = this.record(e);
			t.sticky ? this.stickyNodes.add(e) : this.stickyNodes.delete(e), t.placeDirty && this.place(e);
		});
	}
	updateContentExtent(e, t) {
		let n = t.x + t.paddingLeft, r = t.y + t.paddingTop;
		this.forEachChild(e, (e) => {
			let t = this.record(e);
			n = Math.max(n, t.x + t.width + t.marginRight), r = Math.max(r, t.y + t.height + t.marginBottom);
		}), t.contentWidth = n - t.x + t.paddingRight, t.contentHeight = r - t.y + t.paddingBottom;
	}
	placeAbsoluteChildren(e) {
		let t = this.percentBase;
		this.forEachAbsoluteChild(e, (e) => {
			let t = this.record(e), n = this.containingBlockOf(e);
			this.percentBase = {
				width: n.width,
				height: n.height
			}, this.resolveLayoutProps(e, t);
			let r = e.properties.get("anchor");
			if (r != null) {
				this.anchoredNodes.add(e), this.trackAnchor(e, r);
				let i = this.records.get(r);
				if (i !== void 0) {
					this.placeAnchored(e, t, i, r, n);
					return;
				}
			} else this.anchoredNodes.delete(e), this.trackAnchor(e, null);
			let i = t.marginLeft + t.marginRight, a = t.marginTop + t.marginBottom, o = Math.max(0, n.width - (t.left ?? 0) - (t.right ?? 0) - i), s = Math.max(0, n.height - (t.top ?? 0) - (t.bottom ?? 0) - a), c = t.left !== void 0 && t.right !== void 0 && this.lengthProp(e, "width", n.width) === void 0, l = t.top !== void 0 && t.bottom !== void 0 && this.lengthProp(e, "height", n.height) === void 0;
			this.measure(e, new Y(c ? o : 0, o, l ? s : 0, s));
			let u = t.measuredWidth, d = t.measuredHeight, f;
			f = t.left === void 0 ? t.right === void 0 ? n.x + t.marginLeft : n.x + n.width - t.right - t.marginRight - u : n.x + t.left + t.marginLeft;
			let p;
			p = t.top === void 0 ? t.bottom === void 0 ? n.y + t.marginTop : n.y + n.height - t.bottom - t.marginBottom - d : n.y + t.top + t.marginTop, this.assignBox(e, f, p, u, d);
		}), this.percentBase = t;
	}
	placeAnchored(e, t, n, r, i) {
		this.measure(e, new Y(0, Math.max(0, i.width), 0, Math.max(0, i.height)));
		let a = t.measuredWidth, o = t.measuredHeight, s = this.numberProp(e, "anchorOffset") ?? 0, { side: c, align: l } = this.parsePlacement(e.properties.get("placement")), u = this.scrollOffsetOf(r), d = this.scrollOffsetOf(e), f = this.stickyOffsetOf(r), p = this.stickyOffsetOf(e), m = n.x + f.x - u.x + d.x - p.x, h = n.y + f.y - u.y + d.y - p.y, g = n.width, _ = n.height, v = c === "top" || c === "bottom", y = c;
		if (v) {
			let e = i.y + i.height - (h + _ + s), t = h - s - i.y;
			c === "bottom" && o > e && t > e ? y = "top" : c === "top" && o > t && e > t && (y = "bottom");
		} else {
			let e = i.x + i.width - (m + g + s), t = m - s - i.x;
			c === "right" && a > e && t > e ? y = "left" : c === "left" && a > t && e > t && (y = "right");
		}
		let b, x;
		v ? (x = y === "bottom" ? h + _ + s : h - s - o, b = l === "start" ? m : l === "end" ? m + g - a : m + (g - a) / 2, b = this.clamp(b, i.x, Math.max(i.x, i.x + i.width - a))) : (b = y === "right" ? m + g + s : m - s - a, x = l === "start" ? h : l === "end" ? h + _ - o : h + (_ - o) / 2, x = this.clamp(x, i.y, Math.max(i.y, i.y + i.height - o))), this.assignBox(e, b, x, a, o);
	}
	trackAnchor(e, t) {
		let n = this.anchorOf.get(e);
		if (n === (t ?? void 0)) return;
		if (n !== void 0) {
			let t = this.anchorDependents.get(n);
			t?.delete(e), t !== void 0 && t.size === 0 && this.anchorDependents.delete(n);
		}
		if (t === null) {
			this.anchorOf.delete(e);
			return;
		}
		this.anchorOf.set(e, t);
		let r = this.anchorDependents.get(t);
		r === void 0 && (r = /* @__PURE__ */ new Set(), this.anchorDependents.set(t, r)), r.add(e);
	}
	forgetAnchoring(e) {
		this.trackAnchor(e, null);
		let t = this.anchorDependents.get(e);
		if (t !== void 0) {
			for (let e of t) this.anchorOf.delete(e);
			this.anchorDependents.delete(e);
		}
	}
	replaceMovedAnchored() {
		for (let e = 0; this.movedAnchored.size > 0 && e < mu; e++) {
			let e = [...this.movedAnchored];
			this.movedAnchored.clear();
			for (let t of e) this.replaceAnchored(t);
		}
		this.movedAnchored.clear();
	}
	replaceAnchored(e) {
		let t = this.records.get(e), n = this.anchorOf.get(e), r = n === void 0 ? void 0 : this.records.get(n);
		if (t === void 0 || n === void 0 || r === void 0) return;
		let i = this.percentBase, a = this.containingBlockOf(e);
		this.percentBase = {
			width: a.width,
			height: a.height
		}, this.resolveLayoutProps(e, t), this.placeAnchored(e, t, r, n, a), this.percentBase = i, t.placeDirty && this.place(e);
	}
	parsePlacement(e) {
		let [t, n] = (typeof e == "string" ? e : "bottom").split("-");
		return {
			side: t === "top" || t === "left" || t === "right" ? t : "bottom",
			align: n === "start" || n === "end" ? n : "center"
		};
	}
	stickyOffsetOf(e) {
		let t = 0, n = 0;
		if (this.stickyNodes.size === 0) return {
			x: t,
			y: n
		};
		for (let r = e; r !== null; r = r.parent) {
			let e = this.records.get(r);
			e !== void 0 && (t += e.stickyOffsetX, n += e.stickyOffsetY);
		}
		return {
			x: t,
			y: n
		};
	}
	scrollOffsetOf(e) {
		let t = 0, n = 0;
		for (let r = e.parent; r !== null; r = r.parent) {
			let e = this.records.get(r);
			e !== void 0 && e.scrollable && (t += e.scrollX, n += e.scrollY);
		}
		return {
			x: t,
			y: n
		};
	}
	containingBlockOf(e) {
		for (let t = e.parent; t !== null; t = t.parent) {
			if (this.isFragment(t)) continue;
			let e = this.records.get(t);
			if (e !== void 0 && (e.positioned || t === this.layoutRoot)) return {
				x: e.x,
				y: e.y,
				width: e.width,
				height: e.height
			};
		}
		let t = this.record(this.layoutRoot);
		return {
			x: t.x,
			y: t.y,
			width: t.width,
			height: t.height
		};
	}
	updatePaintOrder(e, t) {
		let n = !1, r = [];
		if (this.forEachChild(e, (e) => {
			let t = this.record(e);
			r.push(e), (t.zIndex !== 0 || t.positioned) && (n = !0);
		}), !n) {
			t.paintOrder = null;
			return;
		}
		let i = (e) => {
			let t = this.record(e);
			return t.zIndex * 2 + +!!t.positioned;
		};
		r.sort((e, t) => i(e) - i(t)), t.paintOrder = r;
	}
	placeFlex(e, t, n) {
		let r = n === J.Row, i = this.flexConfig(e, t, n), a = t.paddingLeft + t.paddingRight, o = t.paddingTop + t.paddingBottom, s = t.x + t.paddingLeft, c = t.y + t.paddingTop, l = Math.max(0, (r ? t.width : t.height) - (r ? a : o)), u = Math.max(0, (r ? t.height : t.width) - (r ? o : a)), d = r ? new Y(l, l, u, u) : new Y(u, u, l, l), f = this.collectFlexItems(e, d, n, i, !i.wrap);
		if (f.length === 0) return;
		let p = this.breakLines(f, i, l);
		for (let e of p) e.free = this.resolveLine(e, l - i.gapMain * (e.items.length - 1), i), this.distributeAutoMargins(e), this.measureFlexedItems(e.items, d, n, i.wrap ? void 0 : u), e.cross = this.flexLineCross(e.items, r);
		this.markFlexBoundaries(p), p.length === 1 && !i.wrap ? p[0].cross = u : this.alignLines(p, u, i);
		let m = r ? c : s, h = m;
		for (let e = 0; e < p.length; e++) {
			let t = p[e];
			t.crossStart = h + (t.leading ?? 0), h = t.crossStart + t.cross + (e < p.length - 1 ? t.between ?? i.gapLine : 0), i.wrapReverse && (t.crossStart = m + u - (t.crossStart - m) - t.cross), this.stretchItems(t.items, d, n, t.cross);
		}
		let g = r ? s : c;
		for (let e of p) {
			let t = 0, n = i.gapMain, a = e.free ?? 0;
			if (a > 0) switch (i.mainAlign) {
				case Ml.Center:
					t = a / 2;
					break;
				case Ml.End:
					t = a;
					break;
				case Ml.SpaceBetween:
					e.items.length > 1 && (n = i.gapMain + a / (e.items.length - 1));
					break;
				case Ml.SpaceEvenly: {
					let r = a / (e.items.length + 1);
					t = r, n = i.gapMain + r;
					break;
				}
				case Ml.SpaceAround: {
					let r = a / e.items.length;
					t = r / 2, n = i.gapMain + r;
					break;
				}
			}
			let o = 0;
			if (r) for (let t of e.items) t.align === G.Baseline && (o = Math.max(o, t.marginCrossStart + this.itemBaseline(t)));
			let s = g + t;
			for (let t = 0; t < e.items.length; t++) {
				let a = e.items[t], c = s + a.marginMainStart;
				i.mainReversed && (c = g + l - (c - g) - a.finalMain);
				let { crossPos: u, crossDim: d } = this.crossPlacement(a, e, o, i.crossReversed), f = r ? c : u, p = r ? u : c, m = r ? a.finalMain : d, h = r ? d : a.finalMain;
				this.assignBox(a.child, f, p, m, h), s += a.marginMainStart + a.finalMain + a.marginMainEnd, t < e.items.length - 1 && (s += n);
			}
		}
	}
	distributeAutoMargins(e) {
		let t = e.free ?? 0;
		if (t <= 0) return;
		let n = 0;
		for (let t of e.items) n += +!!t.marginMainStartAuto + +!!t.marginMainEndAuto;
		if (n === 0) return;
		let r = t / n;
		for (let t of e.items) t.marginMainStartAuto && (t.marginMainStart += r), t.marginMainEndAuto && (t.marginMainEnd += r);
		e.free = 0;
	}
	alignLines(e, t, n) {
		let r = n.gapLine * (e.length - 1);
		for (let t of e) r += t.cross;
		let i = Math.max(0, t - r);
		for (let t of e) t.leading = 0, t.between = void 0;
		if (i !== 0) switch (n.alignContent) {
			case q.Stretch:
				for (let t of e) t.cross += i / e.length;
				break;
			case q.Center:
				e[0].leading = i / 2;
				break;
			case q.End:
				e[0].leading = i;
				break;
			case q.SpaceBetween:
				if (e.length > 1) for (let t of e) t.between = n.gapLine + i / (e.length - 1);
				break;
			case q.SpaceAround: {
				let t = i / e.length;
				e[0].leading = t / 2;
				for (let r of e) r.between = n.gapLine + t;
				break;
			}
			case q.SpaceEvenly: {
				let t = i / (e.length + 1);
				e[0].leading = t;
				for (let r of e) r.between = n.gapLine + t;
				break;
			}
		}
	}
	stretchItems(e, t, n, r) {
		let i = n === J.Row, a = this.definiteAxis(t, i ? "width" : "height"), o = this.definiteAxis(t, i ? "height" : "width"), s = this.percentBase;
		this.percentBase = i ? {
			width: a,
			height: o
		} : {
			width: o,
			height: a
		};
		for (let a of e) {
			if (a.align !== G.Stretch || a.marginCrossStartAuto || a.marginCrossEndAuto) continue;
			let e = Math.max(0, r - a.marginCrossStart - a.marginCrossEnd), o = this.flexChildConstraints(a.rec, t, n, a.align, a.finalMain, !1), s = i ? new Y(o.minWidth, o.maxWidth, e, e) : new Y(e, e, o.minHeight, o.maxHeight);
			this.measure(a.child, s), a.cross = i ? a.rec.measuredHeight : a.rec.measuredWidth;
		}
		this.percentBase = s;
	}
	crossPlacement(e, t, n, r) {
		let i = t.crossStart, a = e.marginCrossStart + e.marginCrossEnd, o = e.cross + a;
		if (e.marginCrossStartAuto || e.marginCrossEndAuto) {
			let n = Math.max(0, t.cross - o), r = e.marginCrossStartAuto ? e.marginCrossEndAuto ? n / 2 : n : 0;
			return {
				crossPos: i + e.marginCrossStart + r,
				crossDim: e.cross
			};
		}
		switch (e.align) {
			case G.Stretch: return {
				crossPos: r ? i + (t.cross - o) + e.marginCrossStart : i + e.marginCrossStart,
				crossDim: e.cross
			};
			case G.Center: return {
				crossPos: i + e.marginCrossStart + (t.cross - o) / 2,
				crossDim: e.cross
			};
			case G.End: return {
				crossPos: i + (t.cross - o) + e.marginCrossStart,
				crossDim: e.cross
			};
			case G.Baseline: return {
				crossPos: i + n - this.itemBaseline(e),
				crossDim: e.cross
			};
			default: return {
				crossPos: i + e.marginCrossStart,
				crossDim: e.cross
			};
		}
	}
	placeStack(e, t) {
		let n = t.x + t.paddingLeft, r = t.y + t.paddingTop, i = Math.max(0, t.width - t.paddingLeft - t.paddingRight), a = Math.max(0, t.height - t.paddingTop - t.paddingBottom), o = K(e.properties.get("x")) ?? G.Start, s = K(e.properties.get("y")) ?? G.Start, c = this.startEdge(e) === "right", l = this.percentBase;
		this.percentBase = {
			width: i,
			height: a
		}, this.forEachLayoutChild(e, (e) => {
			let t = this.record(e);
			this.resolveLayoutProps(e, t);
			let l = this.stackAlignment(e, "selfX", "width", o, c), u = this.stackAlignment(e, "selfY", "height", s), d = Math.max(0, i - t.marginLeft - t.marginRight), f = Math.max(0, a - t.marginTop - t.marginBottom), p = l === G.Stretch, m = u === G.Stretch;
			if (p || m) {
				let n = t.lastConstraints;
				this.measure(e, new Y(p ? d : n.minWidth, p ? d : n.maxWidth, m ? f : n.minHeight, m ? f : n.maxHeight));
			}
			let h = t.measuredWidth, g = t.measuredHeight, _ = n + t.marginLeft + this.stackOffset(l, d, h, c), v = r + t.marginTop + this.stackOffset(u, f, g);
			this.assignBox(e, _, v, h, g);
		}), this.percentBase = l;
	}
	stackAlignment(e, t, n, r, i = !1) {
		let a = K(e.properties.get(t)) ?? r;
		return a === G.Baseline && (a = G.Start), a === G.Stretch && this.lengthProp(e, n, n === "width" ? this.percentBase.width : this.percentBase.height) !== void 0 && (a = G.Start), i ? yu(a) : a;
	}
	stackOffset(e, t, n, r = !1) {
		switch (e) {
			case G.Center: return (t - n) / 2;
			case G.End: return t - n;
			case G.Stretch: return r ? t - n : 0;
			default: return 0;
		}
	}
	markLayoutDirty(e, t = !1) {
		let n = e;
		for (;;) {
			let r = this.records.get(n);
			if (r !== void 0 && (r.measureDirty = !0, r.placeDirty = !0), n === this.layoutRoot || n.parent === null) {
				this.relayoutRoots.add(this.layoutRoot ?? n);
				return;
			}
			if (r?.relayoutBoundary && !r.positioned && (n !== e || t)) {
				this.relayoutRoots.add(n);
				return;
			}
			n = n.parent;
		}
	}
	applyScroll() {
		for (let e of this.scrollNodes) this.applyScrollOffset(e, !1);
		for (let e of this.textScrollNodes) this.applyScrollOffset(e, !0);
		this.applySticky();
	}
	applyScrollOffset(e, t) {
		let n = this.record(e), r = this.numberProp(e, "scrollX") ?? 0, i = this.numberProp(e, "scrollY") ?? 0, a = +!!t, o = n.contentWidth - n.width, s = n.contentHeight - n.height, c = o > 0 ? o + a : 0, l = s > 0 ? s + a : 0, u = this.clamp(r, 0, c), d = this.clamp(i, 0, l);
		(u !== n.scrollX || d !== n.scrollY) && (n.scrollX = u, n.scrollY = d, t || (n.scrollbarVisibleUntil = this.now() + pu)), n.transformDirty = !1;
	}
	applySticky() {
		this.stickyShifted.clear();
		for (let e of this.stickyNodes) {
			let t = this.records.get(e);
			if (t === void 0) continue;
			let n = t.stickyOffsetX, r = t.stickyOffsetY;
			this.resolveStickyOffset(e, t), (t.stickyOffsetX !== n || t.stickyOffsetY !== r) && this.stickyShifted.add(e);
		}
		this.stickyShifted.size > 0 && (this.layoutVersion++, this.anchorOf.size > 0 && this.followStickyShifts());
	}
	resolveStickyOffset(e, t) {
		t.stickyOffsetX = 0, t.stickyOffsetY = 0;
		let n = this.scrollAncestorOf(e), r = this.flowParentOf(e);
		if (n === null || r === null) return;
		let i = this.record(n), a = this.record(r), o = r === n, s = a.y + a.paddingTop, c = a.x + a.paddingLeft, l = o ? a.y + a.contentHeight - a.paddingBottom : a.y + a.height - a.paddingBottom, u = o ? a.x + a.contentWidth - a.paddingRight : a.x + a.width - a.paddingRight, d = i.y + i.scrollY + 0, f = i.x + i.scrollX, p = d + i.height, m = f + i.width;
		if (t.top !== void 0) {
			let e = d + t.top - t.y, n = l - t.height - t.y;
			t.stickyOffsetY = this.clamp(e, 0, Math.max(0, n));
		} else if (t.bottom !== void 0) {
			let e = p - t.bottom - t.height - t.y, n = s - t.y;
			t.stickyOffsetY = this.clamp(e, Math.min(0, n), 0);
		}
		if (t.left !== void 0) {
			let e = f + t.left - t.x, n = u - t.width - t.x;
			t.stickyOffsetX = this.clamp(e, 0, Math.max(0, n));
		} else if (t.right !== void 0) {
			let e = m - t.right - t.width - t.x, n = c - t.x;
			t.stickyOffsetX = this.clamp(e, Math.min(0, n), 0);
		}
	}
	followStickyShifts() {
		for (let [e, t] of this.anchorOf) (this.carriedBySticky(t) || this.carriedBySticky(e)) && this.movedAnchored.add(e);
	}
	carriedBySticky(e) {
		for (let t = e; t !== null; t = t.parent) if (this.stickyShifted.has(t)) return !0;
		return !1;
	}
	scrollAncestorOf(e) {
		for (let t = e.parent; t !== null; t = t.parent) {
			let e = this.records.get(t);
			if (e !== void 0 && e.scrollable) return t;
		}
		return null;
	}
	flowParentOf(e) {
		for (let t = e.parent; t !== null; t = t.parent) if (!this.isFragment(t)) return t;
		return null;
	}
	now() {
		return typeof performance < "u" ? performance.now() : Date.now();
	}
	record(e) {
		let t = this.records.get(e);
		return t === void 0 && (t = this.retiredRecords.get(e), t === void 0 ? t = new ql(e) : t.reset(), this.records.set(e, t)), t;
	}
	computeRootBox() {
		let e = this.record(this.layoutRoot), t = this.rootConstraints, n = e.measuredWidth, r = e.measuredHeight, i = this.lengthProp(this.layoutRoot, "width", this.rootPercentBase(t).width), a = this.lengthProp(this.layoutRoot, "height", this.rootPercentBase(t).height);
		return i === void 0 && t.hasBoundedWidth() && (n = t.maxWidth), a === void 0 && t.hasBoundedHeight() && (r = t.maxHeight), n = Math.max(n, t.minWidth), r = Math.max(r, t.minHeight), {
			width: n,
			height: r
		};
	}
	resolveLayoutProps(e, t) {
		let n = e.properties, r = this.percentBase;
		if (t.propsPass === this.layoutPass && t.propsBaseWidth === r.width && t.propsBaseHeight === r.height) return;
		t.propsPass = this.layoutPass, t.propsBaseWidth = r.width, t.propsBaseHeight = r.height;
		let i = this.numberProp(e, "flex");
		t.flexGrow = this.numberProp(e, "flexGrow") ?? i ?? 0, t.flexShrink = this.numberProp(e, "flexShrink") ?? 1, t.flexBasisZero = i !== void 0 && n.get("flexBasis") === void 0;
		let a = this.lengthPropOrAuto(e, "minWidth", r.width), o = this.lengthPropOrAuto(e, "minHeight", r.height);
		t.minWidthAuto = typeof a != "number", t.minHeightAuto = typeof o != "number", t.minWidth = typeof a == "number" ? a : 0, t.minHeight = typeof o == "number" ? o : 0, t.maxWidth = this.lengthProp(e, "maxWidth", r.width) ?? Infinity, t.maxHeight = this.lengthProp(e, "maxHeight", r.height) ?? Infinity;
		let s = !gu(n) || this.startEdge(e) === "left";
		t.paddingLeft = this.spacingProp(n, "paddingLeft", s ? "paddingStart" : "paddingEnd", "paddingX"), t.paddingRight = this.spacingProp(n, "paddingRight", s ? "paddingEnd" : "paddingStart", "paddingX"), t.paddingTop = this.spacingProp(n, "paddingTop", void 0, "paddingY"), t.paddingBottom = this.spacingProp(n, "paddingBottom", void 0, "paddingY");
		let c = this.marginProp(n, "marginLeft", s ? "marginStart" : "marginEnd", "marginX"), l = this.marginProp(n, "marginRight", s ? "marginEnd" : "marginStart", "marginX"), u = this.marginProp(n, "marginTop", void 0, "marginY"), d = this.marginProp(n, "marginBottom", void 0, "marginY");
		t.marginLeftAuto = c === "auto", t.marginRightAuto = l === "auto", t.marginTopAuto = u === "auto", t.marginBottomAuto = d === "auto", t.marginLeft = typeof c == "number" ? c : 0, t.marginRight = typeof l == "number" ? l : 0, t.marginTop = typeof u == "number" ? u : 0, t.marginBottom = typeof d == "number" ? d : 0;
		let f = n.get("position");
		t.absolute = f === "absolute", t.sticky = f === "sticky", t.positioned = t.absolute || t.sticky || f === "relative";
		let p = n.get("overflow");
		t.scrollable = e.type === A.ScrollView || p === "scroll" || p === "auto", t.mirrored = t.scrollable && this.startEdge(e) === "right", t.clips = t.scrollable || p === "hidden" || e.type === A.EditableText;
		let m = this.lengthProp(e, "inset", r.width), h = this.lengthProp(e, "inset", r.height);
		t.top = this.lengthProp(e, "top", r.height) ?? h, t.right = this.lengthProp(e, "right", r.width) ?? m, t.bottom = this.lengthProp(e, "bottom", r.height) ?? h, t.left = this.lengthProp(e, "left", r.width) ?? m, t.zIndex = this.numberProp(e, "zIndex") ?? 0, this.setLifted(e, t, e.properties.get("lift") === !0), t.liftBoundary = e.properties.get("liftBoundary") === !0;
		let g = this.numberProp(e, "aspectRatio");
		t.aspectRatio = g !== void 0 && g > 0 ? g : void 0;
	}
	applyAspectRatio(e, t, n) {
		let r = n.minWidth === n.maxWidth, i = n.minHeight === n.maxHeight;
		if (r && !i) return {
			width: e.width,
			height: n.minWidth / t
		};
		if (i && !r) return {
			width: n.minHeight * t,
			height: e.height
		};
		if (!r && !i) {
			if (e.width > 0) return {
				width: e.width,
				height: e.width / t
			};
			if (e.height > 0) return {
				width: e.height * t,
				height: e.height
			};
		}
		return e;
	}
	rootPercentBase(e) {
		return {
			width: e.hasBoundedWidth() ? e.maxWidth : void 0,
			height: e.hasBoundedHeight() ? e.maxHeight : void 0
		};
	}
	definiteAxis(e, t) {
		return t === "width" ? isFinite(e.maxWidth) && e.minWidth === e.maxWidth ? e.maxWidth : void 0 : isFinite(e.maxHeight) && e.minHeight === e.maxHeight ? e.maxHeight : void 0;
	}
	effectiveConstraints(e, t, n) {
		let r = this.percentBase;
		this.axisConstraints(t.minWidth, t.maxWidth, this.lengthProp(e, "width", r.width), n === void 0 ? this.lengthProp(e, "minWidth", r.width) ?? 0 : n.minWidth, n === void 0 ? this.lengthProp(e, "maxWidth", r.width) ?? Infinity : n.maxWidth);
		let i = this.axisMin, a = this.axisMax;
		return this.axisConstraints(t.minHeight, t.maxHeight, this.lengthProp(e, "height", r.height), n === void 0 ? this.lengthProp(e, "minHeight", r.height) ?? 0 : n.minHeight, n === void 0 ? this.lengthProp(e, "maxHeight", r.height) ?? Infinity : n.maxHeight), new Y(i, a, this.axisMin, this.axisMax);
	}
	axisMin = 0;
	axisMax = 0;
	axisConstraints(e, t, n, r, i) {
		let a = Math.max(0, r), o = Math.max(a, i);
		if (e === t) {
			let t = this.clamp(e, a, o);
			this.axisMin = t, this.axisMax = t;
			return;
		}
		if (n !== void 0) {
			let e = this.clamp(n, a, o);
			this.axisMin = e, this.axisMax = e;
			return;
		}
		let s = Math.max(e, a);
		this.axisMin = s, this.axisMax = Math.max(s, Math.min(t, o));
	}
	assignBox(e, t, n, r, i) {
		let a = this.record(e);
		if (a.positioned && !a.absolute && !a.sticky && e !== this.layoutRoot && (t += a.left ?? (a.right === void 0 ? 0 : -a.right), n += a.top ?? (a.bottom === void 0 ? 0 : -a.bottom)), (a.x !== t || a.y !== n || a.width !== r || a.height !== i) && (a.x = t, a.y = n, a.width = r, a.height = i, a.placeDirty = !0, this.layoutVersion++, this.anchorDependents.size > 0)) {
			let t = this.anchorDependents.get(e);
			if (t !== void 0) for (let e of t) this.movedAnchored.add(e);
		}
	}
	scrollDirection(e) {
		return Ul(e.properties.get("direction")) ?? J.Column;
	}
	forEachLayoutChild(e, t) {
		for (let n = e.firstChild; n !== null; n = n.nextSibling) n.type === A.Fragment ? this.forEachLayoutChild(n, t) : n.properties.get("position") !== "absolute" && t(n);
	}
	forEachAbsoluteChild(e, t) {
		for (let n = e.firstChild; n !== null; n = n.nextSibling) n.type === A.Fragment ? this.forEachAbsoluteChild(n, t) : n.properties.get("position") === "absolute" && t(n);
	}
	forEachChild(e, t) {
		for (let n = e.firstChild; n !== null; n = n.nextSibling) n.type === A.Fragment ? this.forEachChild(n, t) : t(n);
	}
	isFragment(e) {
		return e.type === A.Fragment;
	}
	setLifted(e, t, n) {
		t.lifted !== n && (t.lifted = n, n ? this.liftedNodes.add(e) : this.liftedNodes.delete(e));
	}
	get lifted() {
		return this.liftedNodes;
	}
	numberProp(e, t) {
		let n = e.properties.get(t);
		if (typeof n == "number" && Number.isFinite(n)) return n;
	}
	lengthProp(e, t, n) {
		let r = e.properties.get(t);
		if (r === void 0) return;
		if (typeof r == "number" && Number.isFinite(r)) return r;
		let i = Rr(r, n, t);
		return i === "auto" ? void 0 : i;
	}
	lengthPropOrAuto(e, t, n) {
		let r = e.properties.get(t);
		if (r !== void 0) return typeof r == "number" && Number.isFinite(r) ? r : Rr(r, n, t, !0);
	}
	marginProp(e, t, n, r) {
		let i = e.get(t) ?? (n === void 0 ? void 0 : e.get(n)) ?? e.get(r) ?? e.get("margin");
		return i === void 0 ? 0 : typeof i == "number" && Number.isFinite(i) ? i : Rr(i, void 0, t, !0) ?? 0;
	}
	textWrapProp(e) {
		let t = e.properties.get("textWrap");
		if (t === "none" || t === "nowrap") return "none";
		if (t === "char" || t === "word") return t;
	}
	textOverflowProp(e) {
		return e.properties.get("textOverflow") === "ellipsis" ? "ellipsis" : void 0;
	}
	spacingProp(e, t, n, r) {
		let i = e.get(t);
		if (i !== void 0) return this.toNumber(i) ?? 0;
		if (n !== void 0) {
			let t = e.get(n);
			if (t !== void 0) return this.toNumber(t) ?? 0;
		}
		let a = e.get(r);
		if (a !== void 0) return this.toNumber(a) ?? 0;
		let o = e.get("padding");
		return o === void 0 ? 0 : this.toNumber(o) ?? 0;
	}
	startEdge(e) {
		return Fi(e, "textDirection") === "rtl" ? "right" : "left";
	}
	toNumber(e) {
		if (typeof e == "number" && Number.isFinite(e)) return e;
	}
	clamp(e, t, n) {
		return Math.min(Math.max(e, t), n);
	}
}, xu = class {
	listeners = /* @__PURE__ */ new Map();
	last = /* @__PURE__ */ new Map();
	add(e, t) {
		let n = this.listeners.get(e);
		return n === void 0 && (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t), () => {
			let n = this.listeners.get(e);
			n !== void 0 && (n.delete(t), n.size === 0 && (this.listeners.delete(e), this.last.delete(e)));
		};
	}
	get size() {
		return this.listeners.size;
	}
	isEmpty() {
		return this.listeners.size === 0;
	}
	notify(e) {
		for (let [t, n] of this.listeners) {
			let r = e(t), i = this.last.get(t);
			if (!(i !== void 0 && Su(i, r))) {
				this.last.set(t, {
					box: { ...r.box },
					scrollX: r.scrollX,
					scrollY: r.scrollY
				});
				for (let e of n) e(r.box);
			}
		}
	}
	handleNodeRemoved(e) {
		this.listeners.delete(e), this.last.delete(e);
	}
};
function Su(e, t) {
	return e.scrollX === t.scrollX && e.scrollY === t.scrollY && Cu(e.box, t.box);
}
function Cu(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
//#endregion
//#region packages/core/src/rendering/OverlayShapes.ts
function wu(e) {
	return {
		x: Math.max(0, e.box.x),
		y: e.box.y >= e.height ? e.box.y - e.height : e.box.y
	};
}
function Tu(e, t) {
	let n, r, i, a = (t) => {
		n !== t && (e.fillStyle = t, n = t);
	};
	for (let n of t) switch (n.kind) {
		case "fill":
			a(n.color), e.fillRect(n.x, n.y, n.width, n.height);
			break;
		case "stroke": {
			r !== n.color && (e.strokeStyle = n.color, r = n.color), i !== n.lineWidth && (e.lineWidth = n.lineWidth, i = n.lineWidth);
			let t = n.lineWidth / 2;
			e.strokeRect(n.x + t, n.y + t, Math.max(0, n.width - n.lineWidth), Math.max(0, n.height - n.lineWidth));
			break;
		}
		case "label": {
			e.font = n.font, e.textAlign = "left", e.textBaseline = "alphabetic";
			let t = e.measureText(n.text).width + 8, { x: r, y: i } = wu(n);
			a(n.background), e.fillRect(r, i, t, n.height), a(n.textColor), e.fillText(n.text, r + 4, i + n.height - 4);
			break;
		}
	}
}
//#endregion
//#region packages/core/src/rendering/Decorations.ts
function Eu(e, t, n) {
	let r = e.outset ?? 0;
	return {
		x: t.x + (e.x ?? 0) - r,
		y: t.y + (e.y ?? 0) - r,
		width: Math.max(0, (e.width ?? t.width) + 2 * r),
		height: Math.max(0, (e.height ?? t.height) + 2 * r),
		radius: Math.max(0, e.radius ?? n + r)
	};
}
function Du(e, t) {
	return ro(e, t.color);
}
function Ou(e) {
	return e.after === "children";
}
function ku(e, t) {
	for (let n of e) if (Ou(n) === t) return !0;
	return !1;
}
//#endregion
//#region packages/core/src/rendering/ScaledImageCache.ts
var Au = 2, ju = 12e6, Mu = 48;
function Nu(e, t) {
	return new OffscreenCanvas(e, t);
}
function Pu() {
	return typeof OffscreenCanvas == "function";
}
var Fu = class {
	entries = /* @__PURE__ */ new Map();
	sourceIds = /* @__PURE__ */ new WeakMap();
	nextSourceId = 1;
	createSurface;
	enabled;
	constructor(e) {
		this.enabled = e !== void 0 || Pu(), this.createSurface = e ?? Nu;
	}
	resolve(e, t, n) {
		if (!this.enabled) return e;
		let r = Math.round(t), i = Math.round(n);
		if (r <= 0 || i <= 0 || r * i > ju || e.width === r && e.height === i) return e;
		let a = this.keyFor(e, r, i), o = this.entries.get(a);
		if (o === void 0) return this.insert(a, {
			source: e,
			bitmap: null,
			width: r,
			height: i,
			stable: 1
		}), e;
		if (this.entries.delete(a), this.entries.set(a, o), o.bitmap !== null) return o.bitmap;
		if (o.stable++, o.stable < Au) return e;
		let s = this.copy(e, r, i);
		return s === null ? e : (o.bitmap = s, s);
	}
	dispose() {
		for (let e of this.entries.values()) e.bitmap?.close();
		this.entries.clear();
	}
	get size() {
		return this.entries.size;
	}
	keyFor(e, t, n) {
		let r = this.sourceIds.get(e);
		return r === void 0 && (r = this.nextSourceId++, this.sourceIds.set(e, r)), `${r}:${t}x${n}`;
	}
	insert(e, t) {
		if (this.entries.size >= Mu) {
			let e = this.entries.keys().next();
			e.done || (this.entries.get(e.value)?.bitmap?.close(), this.entries.delete(e.value));
		}
		this.entries.set(e, t);
	}
	copy(e, t, n) {
		try {
			let r = this.createSurface(t, n), i = r.getContext("2d");
			return i === null ? null : (i.drawImage(e, 0, 0, t, n), r.transferToImageBitmap());
		} catch {
			return null;
		}
	}
};
//#endregion
//#region packages/core/src/rendering/PaintPathData.ts
function Iu(e, t) {
	let n = new Bu(t), r = 0, i = 0, a = 0, o = 0, s = null, c = null, l = "";
	for (;;) {
		if (n.skipSeparators(), n.done) return;
		let t = n.peekCommand();
		if (t !== void 0) l = t;
		else if (l === "") return;
		else l === "M" ? l = "L" : l === "m" && (l = "l");
		let u = l >= "a", d = u ? l.toUpperCase() : l, f = u ? r : 0, p = u ? i : 0;
		switch (d) {
			case "M":
				r = n.number() + f, i = n.number() + p, a = r, o = i, e.moveTo(r, i), s = null, c = null;
				break;
			case "L":
				r = n.number() + f, i = n.number() + p, e.lineTo(r, i), s = null, c = null;
				break;
			case "H":
				r = n.number() + f, e.lineTo(r, i), s = null, c = null;
				break;
			case "V":
				i = n.number() + p, e.lineTo(r, i), s = null, c = null;
				break;
			case "C": {
				let t = n.number() + f, a = n.number() + p, o = n.number() + f, l = n.number() + p;
				r = n.number() + f, i = n.number() + p, e.bezierCurveTo(t, a, o, l, r, i), s = [o, l], c = null;
				break;
			}
			case "S": {
				let [t, a] = Lu(s, r, i), o = n.number() + f, l = n.number() + p;
				r = n.number() + f, i = n.number() + p, e.bezierCurveTo(t, a, o, l, r, i), s = [o, l], c = null;
				break;
			}
			case "Q": {
				let t = n.number() + f, a = n.number() + p;
				r = n.number() + f, i = n.number() + p, e.quadraticCurveTo(t, a, r, i), c = [t, a], s = null;
				break;
			}
			case "T": {
				let [t, a] = Lu(c, r, i);
				r = n.number() + f, i = n.number() + p, e.quadraticCurveTo(t, a, r, i), c = [t, a], s = null;
				break;
			}
			case "A": {
				let t = n.number(), a = n.number(), o = n.number() * Math.PI / 180, l = n.flag(), u = n.flag(), d = n.number() + f, m = n.number() + p;
				Ru(e, r, i, t, a, o, l, u, d, m), r = d, i = m, s = null, c = null;
				break;
			}
			case "Z":
				e.closePath(), r = a, i = o, s = null, c = null;
				break;
			default: return;
		}
	}
}
function Lu(e, t, n) {
	return e === null ? [t, n] : [2 * t - e[0], 2 * n - e[1]];
}
function Ru(e, t, n, r, i, a, o, s, c, l) {
	if (t === c && n === l) return;
	let u = Math.abs(r), d = Math.abs(i);
	if (u === 0 || d === 0) {
		e.lineTo(c, l);
		return;
	}
	let f = Math.cos(a), p = Math.sin(a), m = (t - c) / 2, h = (n - l) / 2, g = f * m + p * h, _ = -p * m + f * h, v = g * g / (u * u) + _ * _ / (d * d);
	if (v > 1) {
		let e = Math.sqrt(v);
		u *= e, d *= e;
	}
	let y = u * u * d * d - u * u * _ * _ - d * d * g * g, b = u * u * _ * _ + d * d * g * g, x = (o === s ? -1 : 1) * Math.sqrt(Math.max(0, y / b)), S = x * u * _ / d, C = -x * d * g / u, w = f * S - p * C + (t + c) / 2, ee = p * S + f * C + (n + l) / 2, T = Math.atan2((_ - C) / d, (g - S) / u), E = Math.atan2((-_ - C) / d, (-g - S) / u) - T;
	!s && E > 0 ? E -= 2 * Math.PI : s && E < 0 && (E += 2 * Math.PI);
	let te = Math.max(1, Math.ceil(Math.abs(E) / (Math.PI / 2))), ne = E / te, D = 4 / 3 * Math.tan(ne / 4), re = T;
	for (let t = 0; t < te; t++) {
		let t = re + ne, n = Math.cos(re), r = Math.sin(re), i = Math.cos(t), a = Math.sin(t), o = zu(w, ee, u, d, f, p, n - D * r, r + D * n), s = zu(w, ee, u, d, f, p, i + D * a, a - D * i), c = zu(w, ee, u, d, f, p, i, a);
		e.bezierCurveTo(o[0], o[1], s[0], s[1], c[0], c[1]), re = t;
	}
}
function zu(e, t, n, r, i, a, o, s) {
	let c = n * o, l = r * s;
	return [e + i * c - a * l, t + a * c + i * l];
}
var Bu = class {
	source;
	index = 0;
	constructor(e) {
		this.source = e;
	}
	get done() {
		return this.index >= this.source.length;
	}
	skipSeparators() {
		for (; this.index < this.source.length;) {
			let e = this.source.charCodeAt(this.index);
			if (e === 32 || e === 9 || e === 10 || e === 13 || e === 12 || e === 44) {
				this.index++;
				continue;
			}
			return;
		}
	}
	peekCommand() {
		let e = this.source[this.index];
		if (!(e === void 0 || !/[a-zA-Z]/.test(e))) return this.index++, e;
	}
	number() {
		this.skipSeparators();
		let e = this.index;
		for ((this.source[this.index] === "+" || this.source[this.index] === "-") && this.index++; this.isDigit();) this.index++;
		if (this.source[this.index] === ".") for (this.index++; this.isDigit();) this.index++;
		let t = this.source[this.index];
		if (t === "e" || t === "E") for (this.index++, (this.source[this.index] === "+" || this.source[this.index] === "-") && this.index++; this.isDigit();) this.index++;
		let n = Number.parseFloat(this.source.slice(e, this.index));
		return Number.isNaN(n) ? 0 : n;
	}
	flag() {
		this.skipSeparators();
		let e = this.source[this.index];
		return this.index++, e === "1";
	}
	isDigit() {
		let e = this.source.charCodeAt(this.index);
		return e >= 48 && e <= 57;
	}
}, Vu = Object.freeze({ ops: Object.freeze([]) }), Hu = class {
	recorded = [];
	finish() {
		return { ops: this.recorded };
	}
	save() {
		this.recorded.push(Uu);
	}
	restore() {
		this.recorded.push(Wu);
	}
	translate(e, t) {
		this.recorded.push({
			op: "translate",
			x: e,
			y: t
		});
	}
	scale(e, t) {
		this.recorded.push({
			op: "scale",
			x: e,
			y: t
		});
	}
	rotate(e) {
		this.recorded.push({
			op: "rotate",
			angle: e
		});
	}
	transform(e, t, n, r, i, a) {
		this.recorded.push({
			op: "transform",
			a: e,
			b: t,
			c: n,
			d: r,
			e: i,
			f: a
		});
	}
	beginPath() {
		this.recorded.push(Gu);
	}
	moveTo(e, t) {
		this.recorded.push({
			op: "moveTo",
			x: e,
			y: t
		});
	}
	lineTo(e, t) {
		this.recorded.push({
			op: "lineTo",
			x: e,
			y: t
		});
	}
	quadraticCurveTo(e, t, n, r) {
		this.recorded.push({
			op: "quadraticCurveTo",
			cx: e,
			cy: t,
			x: n,
			y: r
		});
	}
	bezierCurveTo(e, t, n, r, i, a) {
		this.recorded.push({
			op: "bezierCurveTo",
			c1x: e,
			c1y: t,
			c2x: n,
			c2y: r,
			x: i,
			y: a
		});
	}
	arc(e, t, n, r, i, a = !1) {
		this.recorded.push({
			op: "arc",
			x: e,
			y: t,
			radius: n,
			startAngle: r,
			endAngle: i,
			counterclockwise: a
		});
	}
	rect(e, t, n, r) {
		this.recorded.push({
			op: "rect",
			x: e,
			y: t,
			width: n,
			height: r
		});
	}
	roundRect(e, t, n, r, i) {
		this.recorded.push({
			op: "roundRect",
			x: e,
			y: t,
			width: n,
			height: r,
			radius: i
		});
	}
	closePath() {
		this.recorded.push(Ku);
	}
	path(e) {
		Iu(this, e);
	}
	fillColor(e) {
		this.recorded.push({
			op: "fillColor",
			color: e
		});
	}
	fillGradient(e, t, n, r, i) {
		this.recorded.push({
			op: "fillGradient",
			gradient: e,
			x: t,
			y: n,
			width: r,
			height: i
		});
	}
	strokeColor(e) {
		this.recorded.push({
			op: "strokeColor",
			color: e
		});
	}
	lineWidth(e) {
		this.recorded.push({
			op: "lineWidth",
			width: e
		});
	}
	lineCap(e) {
		this.recorded.push({
			op: "lineCap",
			cap: e
		});
	}
	lineJoin(e) {
		this.recorded.push({
			op: "lineJoin",
			join: e
		});
	}
	miterLimit(e) {
		this.recorded.push({
			op: "miterLimit",
			limit: e
		});
	}
	lineDash(e, t = 0) {
		this.recorded.push({
			op: "lineDash",
			segments: e,
			offset: t
		});
	}
	alpha(e) {
		this.recorded.push({
			op: "alpha",
			value: e
		});
	}
	blur(e) {
		this.recorded.push({
			op: "blur",
			radius: e
		});
	}
	fill(e = "nonzero") {
		this.recorded.push({
			op: "fill",
			rule: e
		});
	}
	stroke() {
		this.recorded.push(qu);
	}
	clip(e = "nonzero") {
		this.recorded.push({
			op: "clip",
			rule: e
		});
	}
	text(e, t, n, r) {
		this.recorded.push({
			op: "text",
			value: e,
			x: t,
			y: n,
			style: r
		});
	}
	image(e, t, n, r, i) {
		this.recorded.push({
			op: "image",
			image: e,
			x: t,
			y: n,
			width: r,
			height: i
		});
	}
}, Uu = Object.freeze({ op: "save" }), Wu = Object.freeze({ op: "restore" }), Gu = Object.freeze({ op: "beginPath" }), Ku = Object.freeze({ op: "closePath" }), qu = Object.freeze({ op: "stroke" });
function Ju(e, t) {
	for (let n of e.ops) switch (n.op) {
		case "save":
			t.save();
			break;
		case "restore":
			t.restore();
			break;
		case "translate":
			t.translate(n.x, n.y);
			break;
		case "scale":
			t.scale(n.x, n.y);
			break;
		case "rotate":
			t.rotate(n.angle);
			break;
		case "transform":
			t.transform(n.a, n.b, n.c, n.d, n.e, n.f);
			break;
		case "beginPath":
			t.beginPath();
			break;
		case "moveTo":
			t.moveTo(n.x, n.y);
			break;
		case "lineTo":
			t.lineTo(n.x, n.y);
			break;
		case "quadraticCurveTo":
			t.quadraticCurveTo(n.cx, n.cy, n.x, n.y);
			break;
		case "bezierCurveTo":
			t.bezierCurveTo(n.c1x, n.c1y, n.c2x, n.c2y, n.x, n.y);
			break;
		case "arc":
			t.arc(n.x, n.y, n.radius, n.startAngle, n.endAngle, n.counterclockwise);
			break;
		case "rect":
			t.rect(n.x, n.y, n.width, n.height);
			break;
		case "roundRect":
			t.roundRect(n.x, n.y, n.width, n.height, n.radius);
			break;
		case "closePath":
			t.closePath();
			break;
		case "fillColor":
			t.fillColor(n.color);
			break;
		case "fillGradient":
			t.fillGradient(n.gradient, n.x, n.y, n.width, n.height);
			break;
		case "strokeColor":
			t.strokeColor(n.color);
			break;
		case "lineWidth":
			t.lineWidth(n.width);
			break;
		case "lineCap":
			t.lineCap(n.cap);
			break;
		case "lineJoin":
			t.lineJoin(n.join);
			break;
		case "miterLimit":
			t.miterLimit(n.limit);
			break;
		case "lineDash":
			t.lineDash(n.segments, n.offset);
			break;
		case "alpha":
			t.alpha(n.value);
			break;
		case "blur":
			t.blur(n.radius);
			break;
		case "fill":
			t.fill(n.rule);
			break;
		case "stroke":
			t.stroke();
			break;
		case "clip":
			t.clip(n.rule);
			break;
		case "text":
			t.text(n.value, n.x, n.y, n.style);
			break;
		case "image": t.image(n.image, n.x, n.y, n.width, n.height);
	}
}
//#endregion
//#region packages/core/src/rendering/PaintTarget.ts
var Yu = class {
	ctx;
	resolver;
	blurStack = [];
	blurRadius = 0;
	constructor(e, t) {
		this.ctx = e, this.resolver = t;
	}
	save() {
		this.blurStack.push(this.blurRadius), this.ctx.save();
	}
	restore() {
		this.blurRadius = this.blurStack.pop() ?? 0, this.ctx.restore();
	}
	translate(e, t) {
		this.ctx.translate(e, t);
	}
	scale(e, t) {
		this.ctx.scale(e, t);
	}
	rotate(e) {
		this.ctx.rotate(e);
	}
	transform(e, t, n, r, i, a) {
		this.ctx.transform(e, t, n, r, i, a);
	}
	beginPath() {
		this.ctx.beginPath();
	}
	moveTo(e, t) {
		this.ctx.moveTo(e, t);
	}
	lineTo(e, t) {
		this.ctx.lineTo(e, t);
	}
	quadraticCurveTo(e, t, n, r) {
		this.ctx.quadraticCurveTo(e, t, n, r);
	}
	bezierCurveTo(e, t, n, r, i, a) {
		this.ctx.bezierCurveTo(e, t, n, r, i, a);
	}
	arc(e, t, n, r, i, a = !1) {
		this.ctx.arc(e, t, n, r, i, a);
	}
	rect(e, t, n, r) {
		this.ctx.rect(e, t, n, r);
	}
	roundRect(e, t, n, r, i) {
		let a = Math.min(i, n / 2, r / 2);
		if (!(a > 0)) {
			this.ctx.rect(e, t, n, r);
			return;
		}
		this.ctx.moveTo(e + a, t), this.ctx.arcTo(e + n, t, e + n, t + r, a), this.ctx.arcTo(e + n, t + r, e, t + r, a), this.ctx.arcTo(e, t + r, e, t, a), this.ctx.arcTo(e, t, e + n, t, a), this.ctx.closePath();
	}
	closePath() {
		this.ctx.closePath();
	}
	path(e) {
		Iu(this, e);
	}
	fillColor(e) {
		let t = this.resolver.color(e);
		this.ctx.fillStyle = t === void 0 ? "transparent" : W(t);
	}
	fillGradient(e, t, n, r, i) {
		let a = this.resolver.gradient(e);
		if (a === void 0) return;
		let o = Wr(a, r, i);
		if (o.kind === "radial" && !(o.radius > 0)) return;
		let s = o.kind === "linear" ? this.ctx.createLinearGradient(t + o.x0, n + o.y0, t + o.x1, n + o.y1) : this.ctx.createRadialGradient(t + o.x0, n + o.y0, 0, t + o.x0, n + o.y0, o.radius);
		for (let e of o.stops) s.addColorStop(e.offset, W(e.color));
		this.ctx.fillStyle = s;
	}
	strokeColor(e) {
		let t = this.resolver.color(e);
		this.ctx.strokeStyle = t === void 0 ? "transparent" : W(t);
	}
	lineWidth(e) {
		this.ctx.lineWidth = e;
	}
	lineCap(e) {
		this.ctx.lineCap = e;
	}
	lineJoin(e) {
		this.ctx.lineJoin = e;
	}
	miterLimit(e) {
		this.ctx.miterLimit = e;
	}
	lineDash(e, t = 0) {
		this.ctx.setLineDash(e), this.ctx.lineDashOffset = t;
	}
	alpha(e) {
		this.ctx.globalAlpha *= e;
	}
	blur(e) {
		this.blurRadius = Math.max(0, e), (this.ctx.filter !== void 0 || this.blurRadius > 0) && (this.ctx.filter = this.blurRadius > 0 ? `blur(${this.blurRadius}px)` : "none");
	}
	fill(e = "nonzero") {
		this.ctx.fill(e);
	}
	stroke() {
		this.ctx.stroke();
	}
	clip(e = "nonzero") {
		this.ctx.clip(e);
	}
	text(e, t, n, r) {
		let i = r?.fontSize ?? 14, a = r?.fontWeight ?? "normal", o = vs(r?.fontFamily ?? "sans-serif");
		this.ctx.font = `${String(a)} ${i}px ${o}`, this.ctx.textAlign = r?.align ?? "left", this.ctx.textBaseline = "alphabetic", this.ctx.fillText(e, t, n);
	}
	image(e, t, n, r, i) {
		this.ctx.drawImage(e, t, n, r, i);
	}
}, Xu = 8192, Zu = new class {
	slots = /* @__PURE__ */ new WeakMap();
	createCanvas;
	stats = {
		recorded: 0,
		rasterized: 0,
		resolved: 0
	};
	constructor(e = ed) {
		this.createCanvas = e;
	}
	setCanvasFactory(e) {
		this.createCanvas = e;
	}
	resetStats() {
		this.stats.recorded = 0, this.stats.rasterized = 0, this.stats.resolved = 0;
	}
	pictureFor(e, t, n) {
		this.stats.resolved++;
		let r = e.properties.get("paint"), i = e.properties.get("path");
		if (r === void 0 && i === void 0 || !(t.width > 0) || !(t.height > 0)) return;
		let a = e.properties.get("clipPath"), o = e.properties.get("blur"), s = this.slots.get(e);
		if (s !== void 0 && s.picture !== null && s.width === t.width && s.height === t.height && s.scale === n && s.environment === e.environment && s.clipPath === a && s.blur === o && ei(s.paint, r) && ri(s.path, i)) return s.picture;
		let c = {
			width: t.width,
			height: t.height,
			paddingTop: t.paddingTop,
			paddingRight: t.paddingRight,
			paddingBottom: t.paddingBottom,
			paddingLeft: t.paddingLeft,
			scale: n
		}, l = this.record(r, i, a, o, c), u = this.rasterize(e, l, c);
		return s?.picture?.close?.(), this.slots.set(e, {
			picture: u,
			recording: l,
			paint: r,
			path: i,
			clipPath: a,
			blur: o,
			environment: e.environment,
			width: t.width,
			height: t.height,
			scale: n
		}), u ?? void 0;
	}
	recordingFor(e) {
		return this.slots.get(e)?.recording ?? Vu;
	}
	record(e, t, n, r, i) {
		this.stats.recorded++;
		let a = new Hu();
		return n !== void 0 && (a.beginPath(), a.path(n), a.clip()), r !== void 0 && r > 0 && a.blur(r), t !== void 0 && $u(a, t, i), e?.draw(a, i), a.finish();
	}
	rasterize(e, t, n) {
		if (t.ops.length === 0) return null;
		let r = Math.min(Xu, Math.max(1, Math.round(n.width * n.scale))), i = Math.min(Xu, Math.max(1, Math.round(n.height * n.scale))), a = this.createCanvas(r, i), o = a?.context() ?? null;
		return a === null || o === null ? null : (this.stats.rasterized++, o.scale(n.scale, n.scale), Ju(t, new Yu(o, Qu(e))), a.take());
	}
}();
function Qu(e) {
	return {
		color: (t) => ro(e, t),
		gradient: (t) => io(e, t)
	};
}
function $u(e, t, n) {
	let r = {
		width: Math.max(0, n.width - n.paddingLeft - n.paddingRight),
		height: Math.max(0, n.height - n.paddingTop - n.paddingBottom)
	};
	if (!(r.width > 0) || !(r.height > 0)) return;
	if (e.save(), e.translate(n.paddingLeft, n.paddingTop), t.viewBox !== void 0 && t.viewBox > 0) {
		let n = Math.min(r.width / t.viewBox, r.height / t.viewBox);
		e.translate((r.width - t.viewBox * n) / 2, (r.height - t.viewBox * n) / 2), e.scale(n, n);
	}
	e.beginPath(), e.path(t.d), t.fill !== void 0 && (e.fillColor(t.fill), e.fill(t.fillRule ?? "nonzero"));
	let i = t.strokeWidth ?? 0;
	t.stroke !== void 0 && i > 0 && (e.strokeColor(t.stroke), e.lineWidth(i), e.lineCap(t.lineCap ?? "butt"), e.lineJoin(t.lineJoin ?? "miter"), t.miterLimit !== void 0 && e.miterLimit(t.miterLimit), t.dash !== void 0 && t.dash.length > 0 && e.lineDash(t.dash, t.dashOffset ?? 0), e.stroke()), e.restore();
}
function ed(e, t) {
	if (typeof OffscreenCanvas != "function") return null;
	let n = new OffscreenCanvas(e, t);
	return {
		context: () => n.getContext("2d"),
		take: () => n.transferToImageBitmap()
	};
}
//#endregion
//#region packages/core/src/rendering/canvas2d/Canvas2DRenderer.ts
var td = class {
	options;
	backend = "canvas2d";
	disposed = !1;
	contentBox = {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	};
	paint = cs();
	paintOwner = null;
	cullX = 0;
	cullY = 0;
	cullWidth = 0;
	cullHeight = 0;
	cullStack = [];
	scaledImages = new Fu();
	liftedPass = [];
	constructor(e) {
		this.options = e;
	}
	get surface() {
		return this.options.surface;
	}
	initialize() {
		return Promise.resolve();
	}
	get isReady() {
		return !this.disposed;
	}
	resize(e, t, n) {
		this.surface.setLogicalSize(e, t, n);
	}
	dispose() {
		this.disposed = !0, this.scaledImages.dispose();
	}
	render(e, t) {
		let n = this.surface.getContext2D();
		this.beginFrame(n), this.cullStack.length = 0, this.cullX = 0, this.cullY = 0, this.cullWidth = this.surface.logicalWidth, this.cullHeight = this.surface.logicalHeight, this.liftedPass.length = 0, this.paintOwner = null, this.renderNode(e, t, n, !0, !1), this.renderLifted(t, n), t.overlay !== void 0 && t.overlay.length > 0 && Tu(n, t.overlay);
	}
	resolvePaint(e) {
		return this.paintOwner = e, $o(e, this.paint);
	}
	beginFrame(e) {
		e.setTransform(1, 0, 0, 1, 0, 0), e.clearRect(0, 0, this.surface.physicalWidth, this.surface.physicalHeight), this.surface.dpr !== 1 && e.setTransform(this.surface.dpr, 0, 0, this.surface.dpr, 0, 0);
	}
	renderNode(e, t, n, r, i) {
		let a = t.layout.recordFor(e);
		if (a === void 0 || !rs(e)) return;
		if (a.lifted && !i) {
			this.liftedPass.push(e);
			return;
		}
		let o = a.stickyOffsetX !== 0 || a.stickyOffsetY !== 0;
		if (r && !this.intersectsCull(a.x + a.stickyOffsetX, a.y + a.stickyOffsetY, a.width, a.height)) return;
		let s = this.resolvePaint(e), c = s.text !== void 0, l = 0;
		(s.opacity < 1 || s.hasTransform || o) && (n.save(), l++, o && n.translate(a.stickyOffsetX, a.stickyOffsetY), s.opacity < 1 && (n.globalAlpha *= s.opacity), s.hasTransform && this.applyTransform(n, a, s)), this.paintBackground(n, a, s), this.paintImage(n, a, s), e.type === A.Paint && this.paintPicture(n, e, a), this.paintBorder(n, a, s);
		let u = e.decorations;
		u !== null && ku(u, !1) && this.paintDecorations(n, e, a, s, u, !1), a.clips && (n.save(), kr(s.borderRadius) ? (n.beginPath(), n.rect(a.x, a.y, a.width, a.height)) : rd(n, a.x, a.y, a.width, a.height, I(s.borderRadius)), n.clip(), this.pushCull(a)), a.scrollable && (n.save(), n.translate(-a.scrollX, -a.scrollY));
		let d = this.liftedPass.length;
		for (this.renderChildren(e, t, n, r && !s.hasTransform && !o), a.scrollable && n.restore(), a.clips && this.popCull(), c && (this.paintOwner !== e && this.resolvePaint(e), this.paintContent(n, a, this.paint, t)), a.liftBoundary && this.liftedPass.length > d && this.renderLifted(t, n, d, e), a.clips && n.restore(), u !== null && ku(u, !0) && this.paintDecorations(n, e, a, this.paintOwner === e ? this.paint : this.resolvePaint(e), u, !0), a.scrollable && this.paintScrollbars(n, a, t.now ?? performance.now()); l > 0;) n.restore(), l--;
	}
	renderChildren(e, t, n, r) {
		let i = t.layout.recordFor(e)?.paintOrder;
		if (i != null) {
			for (let e of i) this.renderNode(e, t, n, r, !1);
			return;
		}
		let a = e.firstChild;
		for (; a !== null;) a.type === A.Fragment ? this.renderChildren(a, t, n, r) : this.renderNode(a, t, n, r, !1), a = a.nextSibling;
	}
	renderLifted(e, t, n = 0, r = null) {
		if (this.liftedPass.length <= n) return;
		let i = this.surface.dpr;
		for (let a = n; a < this.liftedPass.length; a++) {
			let n = this.liftedPass[a];
			t.save(), r === null && t.setTransform(i, 0, 0, i, 0, 0), this.applyAncestors(n, e, t, r), this.renderNode(n, e, t, !1, !0), t.restore();
		}
		this.liftedPass.length = n;
	}
	applyAncestors(e, t, n, r = null) {
		let i = [];
		for (let t = e.parent; t !== null && t !== r; t = t.parent) i.push(t);
		for (let e = i.length - 1; e >= 0; e--) {
			let r = i[e], a = t.layout.recordFor(r);
			if (a === void 0) continue;
			let o = this.resolvePaint(r);
			(a.stickyOffsetX !== 0 || a.stickyOffsetY !== 0) && n.translate(a.stickyOffsetX, a.stickyOffsetY), o.opacity < 1 && (n.globalAlpha *= o.opacity), o.hasTransform && this.applyTransform(n, a, o), a.scrollable && n.translate(-a.scrollX, -a.scrollY);
		}
	}
	paintBackground(e, t, n) {
		if (n.backgroundColor !== void 0 && (e.fillStyle = W(n.backgroundColor), this.fillBox(e, t, n)), n.backgroundGradient !== void 0) {
			let r = nd(e, n.backgroundGradient, t);
			r !== void 0 && (e.fillStyle = r, this.fillBox(e, t, n));
		}
	}
	fillBox(e, t, n) {
		kr(n.borderRadius) ? e.fillRect(t.x, t.y, t.width, t.height) : (rd(e, t.x, t.y, t.width, t.height, I(n.borderRadius)), e.fill());
	}
	paintImage(e, t, n) {
		let r = n.video, i = r?.frame ?? n.image;
		if (i == null) return;
		let a = r === void 0 ? {
			width: n.image.width,
			height: n.image.height
		} : eo(r), o = is(n.objectFit, a.width, a.height, t);
		if (o.width <= 0 || o.height <= 0) return;
		let s = o.x < t.x || o.y < t.y || o.x + o.width > t.x + t.width || o.y + o.height > t.y + t.height, c = !kr(n.borderRadius), l = r === void 0 ? n.image : void 0, u = l == null ? i : this.scaledFor(e, l, o.width, o.height);
		if (!s && !c) {
			e.drawImage(u, o.x, o.y, o.width, o.height);
			return;
		}
		e.save(), rd(e, t.x, t.y, t.width, t.height, c ? I(n.borderRadius) : 0), e.clip(), e.drawImage(u, o.x, o.y, o.width, o.height), e.restore();
	}
	paintPicture(e, t, n) {
		let r = Zu.pictureFor(t, n, this.surface.dpr);
		r !== void 0 && e.drawImage(r, n.x, n.y, n.width, n.height);
	}
	scaledFor(e, t, n, r) {
		let i = e.getTransform?.(), a = i === void 0 ? this.surface.dpr : Math.hypot(i.a, i.b), o = i === void 0 ? this.surface.dpr : Math.hypot(i.c, i.d);
		return this.scaledImages.resolve(t, n * a, r * o);
	}
	paintBorder(e, t, n) {
		if (n.borderWidth <= 0) return;
		let r = n.borderWidth / 2, i = t.x + r, a = t.y + r, o = Math.max(0, t.width - n.borderWidth), s = Math.max(0, t.height - n.borderWidth);
		e.strokeStyle = n.borderColor === void 0 ? "#000" : W(n.borderColor), e.lineWidth = n.borderWidth, e.lineJoin = "round", kr(n.borderRadius) ? e.strokeRect(i, a, o, s) : (rd(e, i, a, o, s, Math.max(0, I(n.borderRadius) - r)), e.stroke());
	}
	paintDecorations(e, t, n, r, i, a) {
		let o = I(r.borderRadius);
		for (let r of i) {
			if (r.after === "children" !== a) continue;
			let i = Du(t, r);
			if (i === void 0) continue;
			let s = Eu(r, n, o);
			if (s.width <= 0 || s.height <= 0) continue;
			if (r.kind === "fill") {
				e.fillStyle = W(i), s.radius > 0 ? (rd(e, s.x, s.y, s.width, s.height, s.radius), e.fill()) : e.fillRect(s.x, s.y, s.width, s.height);
				continue;
			}
			if (r.lineWidth <= 0) continue;
			let c = r.lineWidth / 2;
			e.strokeStyle = W(i), e.lineWidth = r.lineWidth, e.lineJoin = "round";
			let l = s.x + c, u = s.y + c, d = Math.max(0, s.width - r.lineWidth), f = Math.max(0, s.height - r.lineWidth);
			s.radius > 0 ? (rd(e, l, u, d, f, Math.max(0, s.radius - c)), e.stroke()) : e.strokeRect(l, u, d, f);
		}
	}
	paintContent(e, t, n, r) {
		if (n.text !== void 0) {
			if (this.contentBox.x = t.x + t.paddingLeft - t.scrollX, this.contentBox.y = t.y + t.paddingTop - t.scrollY, this.contentBox.width = Math.max(0, t.width - t.paddingLeft - t.paddingRight), this.contentBox.height = Math.max(0, t.height - t.paddingTop - t.paddingBottom), n.editor !== void 0) {
				this.paintEditable(e, n, r);
				return;
			}
			if (n.textSelection !== void 0 || n.textMatches !== void 0) {
				this.paintHighlightedText(e, n, r);
				return;
			}
			js(e, this.contentBox, n, r.text);
		}
	}
	paintHighlightedText(e, t, n) {
		let r = Cs(this.contentBox, t, n.text), i = Cc(r, t.text, this.contentBox, t, n.text);
		if (Ns(e, Ps(r, t)), t.textMatches !== void 0) {
			e.fillStyle = W(t.matchColor);
			for (let n of t.textMatches) for (let t of Dc(i, n.start, n.end)) e.fillRect(t.x, t.y, t.width, t.height);
		}
		if (t.textSelection !== void 0) {
			e.fillStyle = W(t.selectionColor);
			for (let n of Dc(i, t.textSelection.start, t.textSelection.end)) e.fillRect(n.x, n.y, n.width, n.height);
		}
		Ms(e, r, Es(t), W(t.textColor), t.letterSpacing, t.rtl, t), Ns(e, Fs(r, t));
	}
	paintEditable(e, t, n) {
		let r = t.editor, i = new Vs(r, this.contentBox, t, n.text);
		if (r.focused && !r.collapsed) {
			e.fillStyle = W(t.selectionColor);
			for (let t of i.selectionBoxes()) e.fillRect(t.x, t.y, t.width, t.height);
		}
		if (i.placeholderLines.length > 0 ? Ms(e, i.placeholderLines, Es(t), W(t.placeholderColor), t.letterSpacing, t.rtl) : Ms(e, i.lines, Es(t), W(t.textColor), t.letterSpacing, t.rtl), r.composing) {
			e.fillStyle = W(t.textColor);
			for (let t of i.compositionBoxes()) {
				let n = i.lines[Ha(i.lines, r.composition.start)], a = Math.round(n.baselineY + 1);
				e.fillRect(t.x, a, t.width, 1);
			}
		}
		if (r.focused && r.collapsed && fo(r, n.now ?? performance.now())) {
			let n = i.caretRect();
			e.fillStyle = W(t.caretColor), e.fillRect(Math.round(n.x), n.y, 1, n.height);
		}
	}
	applyTransform(e, t, n) {
		let r = n.transform, i = t.x + r.x, a = t.y + r.y;
		(r.translateX !== 0 || r.translateY !== 0) && e.translate(r.translateX, r.translateY), e.translate(i, a), r.rotation !== 0 && e.rotate(r.rotation), (r.scaleX !== 1 || r.scaleY !== 1) && e.scale(r.scaleX, r.scaleY), e.translate(-i, -a);
	}
	intersectsCull(e, t, n, r) {
		return this.cullWidth <= 0 || this.cullHeight <= 0 ? !1 : e < this.cullX + this.cullWidth && this.cullX < e + n && t < this.cullY + this.cullHeight && this.cullY < t + r;
	}
	paintScrollbars(e, t, n) {
		let r = t.scrollbarVisibleUntil - n;
		if (r <= 0) return;
		e.fillStyle = `rgba(128,128,128,${(Math.min(1, r / 350) * .55).toFixed(3)})`;
		let { vertical: i, horizontal: a } = Nc(t);
		for (let t of [i, a]) {
			if (t === null) continue;
			let { x: n, y: r, width: i, height: a } = t.thumb;
			rd(e, n, r, i, a, 3), e.fill();
		}
	}
	pushCull(e) {
		let t = Math.min(this.cullX + this.cullWidth, e.x + e.width), n = Math.min(this.cullY + this.cullHeight, e.y + e.height), r = Math.max(this.cullX, e.x), i = Math.max(this.cullY, e.y), a = Math.max(0, t - r), o = Math.max(0, n - i);
		this.cullStack.push(this.cullX, this.cullY, this.cullWidth, this.cullHeight), this.cullX = r + e.scrollX, this.cullY = i + e.scrollY, this.cullWidth = a, this.cullHeight = o;
	}
	popCull() {
		this.cullHeight = this.cullStack.pop() ?? 0, this.cullWidth = this.cullStack.pop() ?? 0, this.cullY = this.cullStack.pop() ?? 0, this.cullX = this.cullStack.pop() ?? 0;
	}
};
function nd(e, t, n) {
	let r = Wr(t, n.width, n.height);
	if (r.kind === "radial" && !(r.radius > 0)) return;
	let i = r.kind === "linear" ? e.createLinearGradient(n.x + r.x0, n.y + r.y0, n.x + r.x1, n.y + r.y1) : e.createRadialGradient(n.x + r.x0, n.y + r.y0, 0, n.x + r.x0, n.y + r.y0, r.radius);
	for (let e of r.stops) i.addColorStop(e.offset, W(e.color));
	return i;
}
function rd(e, t, n, r, i, a) {
	let o = Math.min(a, r / 2, i / 2);
	if (o <= 0) {
		e.beginPath(), e.rect(t, n, r, i);
		return;
	}
	e.beginPath(), e.moveTo(t + o, n), e.arcTo(t + r, n, t + r, n + i, o), e.arcTo(t + r, n + i, t, n + i, o), e.arcTo(t, n + i, t, n, o), e.arcTo(t, n, t + r, n, o), e.closePath();
}
//#endregion
//#region packages/core/src/rendering/canvas2d/CanvasSurface.ts
var id = class {
	canvas;
	logicalW = 0;
	logicalH = 0;
	pixelRatio = 1;
	context = null;
	constructor(e) {
		this.canvas = e;
	}
	get logicalWidth() {
		return this.logicalW;
	}
	get logicalHeight() {
		return this.logicalH;
	}
	get dpr() {
		return this.pixelRatio;
	}
	get physicalWidth() {
		return this.canvas.width;
	}
	get physicalHeight() {
		return this.canvas.height;
	}
	getContext2D() {
		return this.context === null && (this.context = this.acquireContext()), this.context;
	}
	acquireContext() {
		let e = this.canvas.getContext("2d");
		if (e === null) throw Error("CanvasSurface: canvas 2D context is unavailable.");
		return e;
	}
	setLogicalSize(e, t, n = 1) {
		this.logicalW = e, this.logicalH = t, this.pixelRatio = n;
		let r = Math.max(1, Math.round(e * n)), i = Math.max(1, Math.round(t * n));
		(this.canvas.width !== r || this.canvas.height !== i) && (this.canvas.width = r, this.canvas.height = i, this.context !== null && (this.context = this.acquireContext()));
	}
};
function ad(e) {
	return new id(e);
}
//#endregion
//#region packages/core/src/rendering/canvas2d/CanvasTextMeasurer.ts
var od = 8192, sd = class extends _c {
	context;
	widths = /* @__PURE__ */ new Map();
	metrics = /* @__PURE__ */ new Map();
	style = Os();
	constructor(e) {
		super(), this.context = e;
	}
	measureRunWidth(e, t) {
		let n = `${ks(t, void 0, this.style)}\0${e}`, r = this.widths.get(n);
		if (r !== void 0) return r;
		As(this.context, this.style);
		let i = this.context.measureText(e).width;
		return this.widths.size >= od && this.widths.clear(), this.widths.set(n, i), i;
	}
	invalidate() {
		super.invalidate(), this.widths.clear(), this.metrics.clear();
	}
	fontMetrics(e) {
		let t = ks(e, void 0, this.style);
		this.style.letterSpacing = 0;
		let n = this.metrics.get(t);
		if (n !== void 0) return n;
		As(this.context, this.style);
		let r = this.context.measureText("Mg"), i = typeof r.fontBoundingBoxAscent == "number" && typeof r.fontBoundingBoxDescent == "number" ? {
			ascent: r.fontBoundingBoxAscent,
			descent: r.fontBoundingBoxDescent
		} : sc(e.fontSize);
		return this.metrics.set(t, i), i;
	}
}, cd = 1500, ld = "rgba(229, 83, 75, 0.35)", ud = "rgba(229, 83, 75, 0.14)", dd = "rgba(229, 83, 75, 0.9)", fd = "rgba(229, 83, 75, 0.45)", pd = "rgba(76, 141, 255, 0.95)", md = "rgba(76, 141, 255, 0.18)", hd = "rgba(46, 168, 138, 0.35)", gd = "rgba(217, 155, 58, 0.3)", _d = "rgba(168, 85, 247, 0.9)", vd = "rgba(46, 168, 138, 0.95)", yd = "rgba(13, 17, 23, 0.92)", bd = "#e6edf3", xd = 10, Sd = "ui-monospace, SFMono-Regular, Menlo, monospace", Cd = `${xd}px ${Sd}`, wd = 16, Td = class {
	engine;
	options;
	enabled = !1;
	hovered = null;
	highlighted = null;
	heat = /* @__PURE__ */ new Map();
	constructor(e, t = {}) {
		this.engine = e, this.options = t;
	}
	get isEnabled() {
		return this.enabled;
	}
	get hoveredNode() {
		return this.hovered;
	}
	get highlightedNode() {
		return this.highlighted;
	}
	get hasOverlay() {
		return this.enabled || this.highlighted !== null;
	}
	setEnabled(e) {
		this.enabled !== e && (this.enabled = e, this.engine.trace = e, e || (this.heat.clear(), this.hovered = null));
	}
	setHovered(e) {
		return e !== this.hovered && (this.hovered = e, !0);
	}
	setHighlighted(e) {
		return e !== this.highlighted && (this.highlighted = e, !0);
	}
	recordLayout(e) {
		if (this.enabled) for (let t of this.engine.stats.measuredNodes) this.heat.set(t, e);
	}
	get heatCount() {
		return this.heat.size;
	}
	explainHovered() {
		return this.hovered === null ? null : this.engine.explain(this.hovered);
	}
	explainHoveredText() {
		let e = this.explainHovered();
		return e === null ? null : fu(e);
	}
	overlay(e) {
		let t = [];
		if (!this.hasOverlay) return {
			shapes: t,
			nextChange: void 0
		};
		let n = this.enabled ? this.heatShapes(t, e) : void 0;
		return this.highlighted !== null && this.hoveredShapes(t, this.highlighted), this.enabled && this.hovered !== null && this.hovered !== this.highlighted && this.hoveredShapes(t, this.hovered), {
			shapes: t,
			nextChange: n
		};
	}
	paint(e, t) {
		let { shapes: n, nextChange: r } = this.overlay(t);
		return Tu(e, n), r;
	}
	heatShapes(e, t) {
		let n;
		for (let [r, i] of this.heat) {
			let a = t - i;
			if (a >= 1500) {
				this.heat.delete(r);
				continue;
			}
			let o = a < 500, s = (o ? 500 : cd) - a;
			n = n === void 0 ? s : Math.min(n, s);
			let c = this.clippedVisibleBox(r);
			c !== null && (r.hasChildren() || e.push({
				kind: "fill",
				...c,
				color: o ? ld : ud
			}), e.push({
				kind: "stroke",
				...c,
				color: o ? dd : fd,
				lineWidth: 1
			}));
		}
		return n;
	}
	hoveredShapes(e, t) {
		let n = this.engine.recordFor(t);
		if (n === void 0) return;
		let r = this.engine.explain(t).relayout.root;
		if (r !== t) {
			let t = this.clippedVisibleBox(r);
			t !== null && e.push({
				kind: "stroke",
				...t,
				color: _d,
				lineWidth: 2
			});
		}
		let i = this.engine.visibleBox(t), a = (t, n, r, i, a) => {
			r > 0 && i > 0 && e.push({
				kind: "fill",
				x: t,
				y: n,
				width: r,
				height: i,
				color: a
			});
		}, o = i.width + n.marginLeft + n.marginRight;
		a(i.x - n.marginLeft, i.y - n.marginTop, o, n.marginTop, gd), a(i.x - n.marginLeft, i.y + i.height, o, n.marginBottom, gd), a(i.x - n.marginLeft, i.y, n.marginLeft, i.height, gd), a(i.x + i.width, i.y, n.marginRight, i.height, gd);
		let s = i.height - n.paddingTop - n.paddingBottom;
		a(i.x, i.y, i.width, n.paddingTop, hd), a(i.x, i.y + i.height - n.paddingBottom, i.width, n.paddingBottom, hd), a(i.x, i.y + n.paddingTop, n.paddingLeft, s, hd), a(i.x + i.width - n.paddingRight, i.y + n.paddingTop, n.paddingRight, s, hd), a(i.x + n.paddingLeft, i.y + n.paddingTop, i.width - n.paddingLeft - n.paddingRight, s, md), e.push({
			kind: "stroke",
			...i,
			color: pd,
			lineWidth: 1
		});
		for (let n of t.decorations ?? []) {
			let t = n.outset ?? 0;
			e.push({
				kind: "stroke",
				x: i.x + (n.x ?? 0) - t,
				y: i.y + (n.y ?? 0) - t,
				width: (n.width ?? i.width) + t * 2,
				height: (n.height ?? i.height) + t * 2,
				color: vd,
				lineWidth: 1
			});
		}
		let c = this.options.modifierNames?.(t) ?? [];
		e.push({
			kind: "label",
			box: i,
			text: `${du(t)} ${Z(i.width)}×${Z(i.height)}${c.length === 0 ? "" : ` · ${c.join(", ")}`}`,
			font: Cd,
			fontSize: xd,
			fontFamily: Sd,
			textColor: bd,
			background: yd,
			height: wd
		});
	}
	clippedVisibleBox(e) {
		let t = this.engine.visibleBox(e), n = t.x, r = t.y, i = t.x + t.width, a = t.y + t.height, o = !1;
		for (let t = e.parent; t !== null; t = t.parent) {
			let e = this.engine.recordFor(t);
			if (e === void 0 || !e.clips) continue;
			let s = this.engine.visibleBox(t);
			if (n = Math.max(n, s.x), r = Math.max(r, s.y), i = Math.min(i, s.x + s.width), a = Math.min(a, s.y + s.height), o = !0, i <= n || a <= r) return null;
		}
		return o ? {
			x: n,
			y: r,
			width: i - n,
			height: a - r
		} : t;
	}
}, Ed = 32, Dd = class {
	entries = /* @__PURE__ */ new Map();
	evictable = [];
	capacity;
	fetchBlob;
	decodeBlob;
	disposed = !1;
	constructor(e = {}) {
		this.capacity = e.capacity ?? Ed, this.fetchBlob = e.fetch ?? Od, this.decodeBlob = e.decode ?? kd;
	}
	get size() {
		return this.entries.size;
	}
	resolve(e) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ Error("The image resolver has been disposed."));
		let t = this.entries.get(e);
		if (t !== void 0) {
			t.holders++;
			let n = this.evictable.indexOf(e);
			return n !== -1 && this.evictable.splice(n, 1), t.bitmap;
		}
		let n = {
			source: e,
			holders: 1,
			settled: null,
			bitmap: this.fetchBlob(e).then((e) => this.decodeBlob(e)).then((t) => {
				if (this.entries.get(e) !== n) throw t.close?.(), Error(`The image '${e}' was released before it finished decoding.`);
				return n.settled = t, t;
			}).catch((t) => {
				if (this.entries.get(e) === n) {
					this.entries.delete(e);
					let t = this.evictable.indexOf(e);
					t !== -1 && this.evictable.splice(t, 1);
				}
				throw t;
			})
		};
		return n.bitmap.catch(() => {}), this.entries.set(e, n), n.bitmap;
	}
	peek(e) {
		if (this.disposed) return null;
		let t = this.entries.get(e);
		if (t === void 0 || t.settled === null) return null;
		t.holders++;
		let n = this.evictable.indexOf(e);
		return n !== -1 && this.evictable.splice(n, 1), t.settled;
	}
	release(e) {
		let t = this.entries.get(e);
		if (t !== void 0 && t.holders !== 0 && (t.holders--, !(t.holders > 0))) for (this.evictable.push(e); this.evictable.length > this.capacity;) {
			let e = this.evictable.shift(), t = this.entries.get(e);
			t === void 0 || t.holders > 0 || (this.entries.delete(e), t.settled?.close?.());
		}
	}
	dispose() {
		this.disposed = !0;
		for (let e of this.entries.values()) e.settled?.close?.();
		this.entries.clear(), this.evictable.length = 0;
	}
};
async function Od(e) {
	let t = await fetch(e);
	if (!t.ok) throw Error(`Fetching the image '${e}' failed with ${t.status} ${t.statusText}.`);
	return t.blob();
}
function kd(e) {
	return typeof createImageBitmap == "function" ? createImageBitmap(e) : Promise.reject(/* @__PURE__ */ Error("createImageBitmap is unavailable, so images cannot be decoded here."));
}
//#endregion
//#region packages/core/src/rendering/IconRasterizer.ts
var Ad = 2, jd = 64;
function Md(e) {
	let { r: t, g: n, b: r, a: i } = e.color;
	return `${e.size}|${e.viewBox}|${e.style}|${e.strokeWidth}|${e.fillRule ?? "nonzero"}|${t},${n},${r},${i}|${e.path}`;
}
var Nd = class {
	rasters = /* @__PURE__ */ new Map();
	evictable = [];
	scale;
	capacity;
	createCanvas;
	constructor(e = {}) {
		this.scale = e.scale ?? Ad, this.capacity = e.capacity ?? jd, this.createCanvas = e.createCanvas ?? Pd;
	}
	get size() {
		return this.rasters.size;
	}
	raster(e) {
		let t = Md(e), n = this.rasters.get(t);
		if (n !== void 0) {
			n.holders++;
			let e = this.evictable.indexOf(t);
			return e !== -1 && this.evictable.splice(e, 1), n.bitmap;
		}
		let r = {
			key: t,
			holders: 1,
			settled: null,
			bitmap: this.draw(e).then((e) => {
				if (this.rasters.get(t) !== r) throw e.close?.(), Error("The icon was released before it finished rasterising.");
				return r.settled = e, e;
			})
		};
		return r.bitmap.catch(() => {}), this.rasters.set(t, r), r.bitmap;
	}
	release(e) {
		let t = Md(e), n = this.rasters.get(t);
		if (n !== void 0 && n.holders !== 0 && (n.holders--, !(n.holders > 0))) for (this.evictable.push(t); this.evictable.length > this.capacity;) {
			let e = this.evictable.shift(), t = this.rasters.get(e);
			t === void 0 || t.holders > 0 || (this.rasters.delete(e), t.settled?.close?.());
		}
	}
	dispose() {
		for (let e of this.rasters.values()) e.settled?.close?.();
		this.rasters.clear(), this.evictable.length = 0;
	}
	async draw(e) {
		let t = Math.max(1, Math.round(e.size * this.scale)), n = this.createCanvas(t, t), r = n.getContext2D();
		if (r === null) throw Error("An icon could not be rasterised: no 2D context.");
		let i = t / e.viewBox;
		r.scale(i, i);
		let a = new Path2D(e.path);
		return e.style === "stroke" ? (r.strokeStyle = W(e.color), r.lineWidth = e.strokeWidth, r.lineCap = "round", r.lineJoin = "round", r.stroke(a)) : (r.fillStyle = W(e.color), r.fill(a, e.fillRule ?? "nonzero")), n.toBitmap();
	}
};
function Pd(e, t) {
	if (typeof OffscreenCanvas != "function") throw Error("OffscreenCanvas is unavailable, so icons cannot be rasterised here.");
	let n = new OffscreenCanvas(e, t);
	return {
		getContext2D: () => n.getContext("2d"),
		toBitmap: () => createImageBitmap(n)
	};
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUError.ts
var Fd = class extends Error {
	phase;
	cause;
	constructor(e, t, n) {
		super(e), this.phase = t, this.cause = n, this.name = "WebGPUError";
	}
};
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUDevice.ts
function Id() {
	return typeof navigator < "u" && navigator.gpu !== void 0;
}
async function Ld() {
	if (typeof navigator > "u" || navigator.gpu === void 0) throw new Fd("navigator.gpu is not present.", "unavailable");
	let e = await navigator.gpu.requestAdapter();
	if (e === null) throw new Fd("No WebGPU adapter found.", "adapter");
	let t = await e.requestDevice();
	return t.lost.then((e) => {
		Rd.forEach((t) => t(e));
	}), {
		adapter: e,
		device: t,
		format: navigator.gpu.getPreferredCanvasFormat()
	};
}
var Rd = /* @__PURE__ */ new Set();
function zd(e) {
	return Rd.add(e), () => {
		Rd.delete(e);
	};
}
var Bd = "\n// x: logical width, y: logical height, z: device pixel ratio.\n@group(0) @binding(0) var<uniform> uView: vec4f;\n\n// The frame's clip chain, four vec4s per node; see CLIP_STRIDE_FLOATS.\n@group(1) @binding(0) var<storage, read> uClips: array<vec4f>;\n\n// The frame's gradients, twelve vec4s each; see GRADIENT_STRIDE_FLOATS.\n// Declared in both pipelines so group 1 reads the same either way; only\n// the primitive pipeline samples it.\n@group(1) @binding(1) var<storage, read> uGradients: array<vec4f>;\n\n// Signed distance from a point to a rounded rectangle, negative inside.\nfn roundedRectDistance(point: vec2f, origin: vec2f, size: vec2f, radius: f32) -> f32 {\n  let half = size * 0.5;\n  let r = min(radius, min(half.x, half.y));\n  let q = abs(point - (origin + half)) - (half - vec2f(r, r));\n  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;\n}\n\n// How much of a pixel lies inside a shape, from the signed distance of\n// its centre in logical pixels.\nfn coverage(signedDistance: f32, dpr: f32) -> f32 {\n  return clamp(0.5 - signedDistance * dpr, 0.0, 1.0);\n}\n\n// Coverage of the fragment at framebuffer position fragPx under every\n// rounded clip from clipIndex up to the root; 1.0 when unclipped.\nfn clipCoverage(fragPx: vec2f, dpr: f32, clipIndex: f32) -> f32 {\n  var result = 1.0;\n  var index = i32(clipIndex);\n  var depth = 0;\n  let screen = fragPx / dpr;\n  loop {\n    if (index < 0 || depth >= 16) {\n      break;\n    }\n    let base = u32(index) * 4u;\n    let rect = uClips[base];\n    let header = uClips[base + 1u];\n    let inverse = uClips[base + 2u];\n    let translation = uClips[base + 3u];\n    let local = vec2f(\n      screen.x * inverse.x + screen.y * inverse.z + translation.x,\n      screen.x * inverse.y + screen.y * inverse.w + translation.y\n    );\n    result = min(result, coverage(roundedRectDistance(local, rect.xy, rect.zw, header.x), dpr));\n    index = i32(header.y);\n    depth = depth + 1;\n  }\n  return result;\n}\n\nfn toClipSpace(transformed: vec2f) -> vec4f {\n  return vec4f((transformed.x / uView.x) * 2.0 - 1.0, 1.0 - (transformed.y / uView.y) * 2.0, 0.0, 1.0);\n}\n", Vd = `
${Bd}

// Twelve vec4s per gradient; colours start at 2 and offsets at 10.
const GRADIENT_STRIDE = 12u;
const GRADIENT_COLORS = 2u;
const GRADIENT_OFFSETS = 10u;

// One stop's position. The lane is picked with comparisons rather than
// by indexing the vec4 with a runtime value, which is legal WGSL but
// not worth depending on for four branches the compiler folds anyway.
fn gradientStopOffset(base: u32, index: u32) -> f32 {
  let row = uGradients[base + GRADIENT_OFFSETS + (index >> 2u)];
  let lane = index & 3u;
  if (lane == 0u) {
    return row.x;
  }
  if (lane == 1u) {
    return row.y;
  }
  if (lane == 2u) {
    return row.z;
  }
  return row.w;
}

fn premultiply(color: vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}

fn unpremultiply(color: vec4f) -> vec4f {
  if (color.a <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return vec4f(color.rgb / color.a, color.a);
}

// The gradient's colour at a point in the instance's own coordinates.
//
// Stops are interpolated with premultiplied alpha, which is what the
// canvas specification says a CanvasGradient does; for the opaque
// stops most gradients have it is the same answer either way, and for
// a stop that fades out it is the difference between a ramp that goes
// through grey and one that does not.
fn gradientColor(index: u32, local: vec2f) -> vec4f {
  let base = index * GRADIENT_STRIDE;
  let header = uGradients[base];
  let geometry = uGradients[base + 1u];
  var t = 0.0;
  if (header.x < 0.5) {
    // Linear: how far along the gradient line the point projects.
    let line = geometry.zw - geometry.xy;
    let lengthSquared = dot(line, line);
    if (lengthSquared > 0.0) {
      t = dot(local - geometry.xy, line) / lengthSquared;
    }
  } else {
    // Radial: distance from the centre over the radius.
    if (geometry.z > 0.0) {
      t = length(local - geometry.xy) / geometry.z;
    }
  }
  t = clamp(t, 0.0, 1.0);

  let count = u32(header.y);
  var previousOffset = gradientStopOffset(base, 0u);
  var previousColor = premultiply(uGradients[base + GRADIENT_COLORS]);
  if (t <= previousOffset) {
    return unpremultiply(previousColor);
  }
  for (var i = 1u; i < count; i = i + 1u) {
    let offset = gradientStopOffset(base, i);
    let color = premultiply(uGradients[base + GRADIENT_COLORS + i]);
    if (t <= offset) {
      let span = offset - previousOffset;
      var f = 0.0;
      if (span > 0.0) {
        f = (t - previousOffset) / span;
      }
      return unpremultiply(mix(previousColor, color, f));
    }
    previousOffset = offset;
    previousColor = color;
  }
  return unpremultiply(previousColor);
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) radiusOpacityBorder: vec3f,
  @location(4) @interpolate(flat) kind: u32,
  @location(5) @interpolate(flat) clipIndex: f32,
  @location(6) @interpolate(flat) gradientIndex: f32,
};

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceColor: vec4f,
  @location(4) radiusOpacityBorder: vec3f,
  @location(5) instanceKind: u32,
  @location(6) transformA: vec2f,
  @location(7) transformB: vec2f,
  @location(8) transformC: vec2f,
  @location(9) clipIndex: f32,
  @location(10) gradientIndex: f32,
) -> VertexOutput {
  var out: VertexOutput;
  // The quad is inflated by one physical pixel on every side so the
  // fragments just outside a fractional or rounded edge exist to be
  // shaded: coverage decides the edge, not rasterisation, which only
  // produces fragments whose centres lie inside the geometry.
  let inflate = 1.0 / uView.z;
  let local = vertex * instanceSize + (vertex * 2.0 - 1.0) * inflate;
  let world = instancePos + local;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );
  out.position = toClipSpace(transformed);
  out.localPos = local;
  out.size = instanceSize;
  out.color = instanceColor;
  out.radiusOpacityBorder = radiusOpacityBorder;
  out.kind = instanceKind;
  out.clipIndex = clipIndex;
  out.gradientIndex = gradientIndex;
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let dpr = uView.z;
  let dist = roundedRectDistance(in.localPos, vec2f(0.0, 0.0), in.size, in.radiusOpacityBorder.x);

  var shape = coverage(dist, dpr);
  if (in.kind != 0u) {
    // Border: the band between the outer edge and the inner edge inset
    // by borderWidth.
    let bw = max(in.radiusOpacityBorder.z, 0.0);
    shape = min(shape, coverage(-(dist + bw), dpr));
  }
  let alpha = shape * clipCoverage(in.position.xy, dpr, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  var base = in.color;
  if (in.gradientIndex >= 0.0) {
    base = gradientColor(u32(in.gradientIndex), in.localPos);
  }
  return vec4f(base.rgb, base.a * in.radiusOpacityBorder.y * alpha);
}
`, Hd = `
${Bd}

@group(0) @binding(1) var tSampler: sampler;
@group(0) @binding(2) var tTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32,
  @location(2) @interpolate(flat) clipIndex: f32,
};

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceOpacity: f32,
  @location(4) clipIndex: f32,
  @location(5) transformA: vec2f,
  @location(6) transformB: vec2f,
  @location(7) transformC: vec2f,
  @location(8) uvOrigin: vec2f,
  @location(9) uvSize: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let world = instancePos + vertex * instanceSize;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );
  out.position = toClipSpace(transformed);
  // A glyph samples its cell in an atlas page; an image passes the
  // whole texture as (0,0)-(1,1) and this is the identity.
  out.uv = uvOrigin + vertex * uvSize;
  out.opacity = instanceOpacity;
  out.clipIndex = clipIndex;
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let alpha = clipCoverage(in.position.xy, uView.z, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  let color = textureSample(tTexture, tSampler, in.uv);
  return vec4f(color.rgb, color.a * in.opacity * alpha);
}
`, Ud = 1.1, Wd = .4, Gd = .2, Kd = 1024, qd = 8, Jd = class {
	styles = /* @__PURE__ */ new Map();
	pages = [];
	pending = [];
	frame = 0;
	cells = 0;
	clearedPages = [];
	pageSize;
	maxPages;
	constructor(e = {}) {
		this.pageSize = e.pageSize ?? Kd, this.maxPages = e.maxPages ?? qd;
	}
	get pageCount() {
		return this.pages.length;
	}
	get glyphCount() {
		return this.cells;
	}
	beginFrame() {
		this.frame++;
	}
	styleFor(e, t, n, r, i = !1) {
		let a = `${e}\0${t}\0${r}\0${i ? "R" : "L"}`, o = this.styles.get(a);
		return o === void 0 && (o = {
			font: e,
			color: t,
			fontSize: n,
			dpr: r,
			rtl: i,
			cells: /* @__PURE__ */ new Map()
		}, this.styles.set(a, o)), o;
	}
	slotFor(e, t, n, r) {
		let i = e.cells.get(t);
		if (i === void 0) i = Array.from({ length: 3 }).fill(null), e.cells.set(t, i);
		else {
			let e = i[r];
			if (e !== null) return this.pages[e.page].lastUsed = this.frame, e;
		}
		let a = e.dpr, o = Math.max(1, Math.ceil(e.fontSize * Gd * a)), s = Math.max(1, Math.ceil(e.fontSize * Ud * a)), c = Math.max(1, Math.ceil(e.fontSize * Wd * a)), l = Math.ceil(n * a) + 2 * o, u = s + c;
		if (l > this.pageSize || u > this.pageSize) return null;
		let d = this.place(l, u);
		if (d === null) return null;
		let f = {
			page: d.page,
			u: d.x / this.pageSize,
			v: d.y / this.pageSize,
			uw: l / this.pageSize,
			vh: u / this.pageSize,
			width: l / a,
			height: u / a,
			offsetX: -o / a,
			offsetY: -s / a
		};
		return i[r] = f, this.cells++, this.pending.push({
			slot: f,
			cluster: t,
			font: e.font,
			color: e.color,
			dpr: a,
			rtl: e.rtl,
			pageX: d.x,
			pageY: d.y,
			pixelWidth: l,
			pixelHeight: u,
			penX: o + r / 3,
			penY: s
		}), f;
	}
	takePending() {
		if (this.pending.length === 0) return [];
		let e = this.pending;
		return this.pending = [], e;
	}
	takeCleared() {
		if (this.clearedPages.length === 0) return [];
		let e = this.clearedPages;
		return this.clearedPages = [], e;
	}
	reset() {
		this.styles.clear(), this.pages.length = 0, this.pending = [], this.clearedPages = [], this.cells = 0;
	}
	place(e, t) {
		for (let n = 0; n < this.pages.length; n++) {
			let r = this.tryPlace(n, e, t);
			if (r !== null) return r;
		}
		if (this.pages.length < this.maxPages) return this.pages.push({
			penX: 0,
			shelfY: 0,
			shelfHeight: 0,
			lastUsed: this.frame
		}), this.tryPlace(this.pages.length - 1, e, t);
		let n = this.leastRecentlyUsedPage();
		return this.clearPage(n), this.tryPlace(n, e, t);
	}
	tryPlace(e, t, n) {
		let r = this.pages[e];
		if (r.penX + t <= this.pageSize && n <= r.shelfHeight) {
			let n = r.penX;
			return r.penX += t, r.lastUsed = this.frame, {
				page: e,
				x: n,
				y: r.shelfY
			};
		}
		let i = r.shelfY + r.shelfHeight;
		return i + n > this.pageSize ? null : (r.shelfY = i, r.shelfHeight = n, r.penX = t, r.lastUsed = this.frame, {
			page: e,
			x: 0,
			y: i
		});
	}
	leastRecentlyUsedPage() {
		let e = 0;
		for (let t = 1; t < this.pages.length; t++) this.pages[t].lastUsed < this.pages[e].lastUsed && (e = t);
		return e;
	}
	clearPage(e) {
		for (let t of this.styles.values()) for (let n of t.cells.values()) for (let t = 0; t < n.length; t++) n[t]?.page === e && (n[t] = null, this.cells--);
		this.pending = this.pending.filter((t) => t.slot.page !== e), this.pages[e] = {
			penX: 0,
			shelfY: 0,
			shelfHeight: 0,
			lastUsed: this.frame
		}, this.clearedPages.push(e);
	}
};
function Yd(e) {
	let t = Math.floor(e * 3);
	return Math.min(2, Math.max(0, t));
}
//#endregion
//#region packages/core/src/rendering/BidiRuns.ts
function Xd(e, t) {
	if (t) return !0;
	for (let t of e) {
		let e = rf(t.codePointAt(0));
		if (e === "R" || e === "AL") return !0;
	}
	return !1;
}
function Zd(e, t) {
	let n = of(e);
	if (n.length === 0) return n;
	let r = +!!t, i = n.map((e) => e.blank ? "WS" : ef(e.text)), a = r === 0 ? "L" : "R";
	for (let e = 0; e < i.length; e++) {
		let t = i[e];
		t === "L" || t === "R" || t === "AL" ? a = t : t === "EN" && (a === "AL" ? i[e] = "AN" : a === "L" && (i[e] = "L"));
	}
	let o = i.map((e) => e === "L" ? "L" : "R"), s = 0;
	for (; s < i.length;) {
		if (!Qd(i[s])) {
			s++;
			continue;
		}
		let e = s;
		for (; e < i.length && Qd(i[e]);) e++;
		let t = s === 0 ? null : o[s - 1], n = e === i.length ? null : $d(i[e]), a = t !== null && t === n ? t : r === 0 ? "L" : "R";
		for (let t = s; t < e; t++) o[t] = a;
		s = e;
	}
	let c = i.map((e, t) => e === "EN" || e === "AN" ? 2 : e === "R" || e === "AL" ? 1 : e === "L" || o[t] === "L" ? r === 0 ? 0 : 2 : 1);
	for (let e = c.length - 1; e >= 0 && n[e].blank; e--) c[e] = r;
	let l = Math.max(...c), u = Math.min(...c.map((e) => e % 2 == 1 ? e : Infinity)), d = n.map((e, t) => t);
	for (let e = l; e >= Math.max(1, u); e--) {
		let t = 0;
		for (; t < d.length;) {
			if (c[d[t]] < e) {
				t++;
				continue;
			}
			let n = t;
			for (; n < d.length && c[d[n]] >= e;) n++;
			cf(d, t, n), t = n;
		}
	}
	return d.map((e) => n[e]);
}
function Qd(e) {
	return e === "ON" || e === "WS";
}
function $d(e) {
	return e === "L" ? "L" : e === "R" || e === "AL" || e === "EN" || e === "AN" ? "R" : null;
}
function ef(e) {
	let t = null;
	for (let n of e) {
		let e = n.codePointAt(0), r = rf(e);
		if (r !== null) return r;
		e >= 1632 && e <= 1641 ? t = "AN" : t === null && tf.test(n) && (t = "EN");
	}
	return t ?? "ON";
}
var tf = /^\p{Nd}$/u, nf = /^\p{L}$/u;
function rf(e) {
	return e >= 1536 && e <= 1791 && !(e >= 1632 && e <= 1641) && !(e >= 1776 && e <= 1785) || e >= 1872 && e <= 1919 || e >= 2160 && e <= 2303 || e >= 1792 && e <= 1871 || e >= 1920 && e <= 1983 || e >= 64336 && e <= 65023 || e >= 65136 && e <= 65279 ? af(e) ? null : "AL" : e >= 1424 && e <= 1535 || e >= 1984 && e <= 2047 || e >= 64285 && e <= 64335 ? af(e) ? null : "R" : nf.test(String.fromCodePoint(e)) ? "L" : null;
}
function af(e) {
	let t = String.fromCodePoint(e);
	return !nf.test(t);
}
function of(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = sf(e.charCodeAt(n)), i = n + 1;
		for (; i < e.length && sf(e.charCodeAt(i)) === r;) i++;
		t.push({
			start: n,
			end: i,
			text: e.slice(n, i),
			blank: r
		}), n = i;
	}
	return t;
}
function sf(e) {
	return e === 32 || e === 9 || e === 12288 || e === 160;
}
function cf(e, t, n) {
	for (let r = t, i = n - 1; r < i; r++, i--) {
		let t = e[r];
		e[r] = e[i], e[i] = t;
	}
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUGlyphShaper.ts
var lf = 4096, uf = class {
	cache = /* @__PURE__ */ new Map();
	get size() {
		return this.cache.size;
	}
	shape(e, t, n, r, i = !1) {
		if (e.length === 0) return [];
		let a = `${t}\0${i ? "R" : "L"}\0${e}`, o = this.cache.get(a);
		if (o !== void 0) return o;
		let s = Xd(e, i) ? this.shapeWords(e, r, i) : this.shapeClusters(e, n, r);
		return this.cache.size >= lf && this.cache.clear(), this.cache.set(a, s), s;
	}
	shapeWords(e, t, n) {
		let r = [], i = 0;
		for (let a of Zd(e, n)) {
			let e = t(a.text);
			r.push({
				text: a.text,
				x: i,
				advance: e,
				blank: a.blank
			}), i += e;
		}
		return r;
	}
	shapeClusters(e, t, n) {
		let r = ka(e), i = [], a = 0;
		for (let o = 1; o < r.length; o++) {
			let s = r[o], c = o === r.length - 1 ? t : n(e.slice(0, s)), l = e.slice(r[o - 1], s);
			i.push({
				text: l,
				x: a,
				advance: Math.max(0, c - a),
				blank: df(l)
			}), a = c;
		}
		return i;
	}
	clear() {
		this.cache.clear();
	}
};
function df(e) {
	for (let t = 0; t < e.length; t++) {
		let n = e.charCodeAt(t);
		if (n !== 32 && n !== 9 && n !== 10 && n !== 13 && n !== 12 && n !== 11 && !(n >= 8192 && n <= 8202) && n !== 160 && n !== 12288) return !1;
	}
	return !0;
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUColor.ts
function ff(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return typeof t.r == "number" && typeof t.g == "number" && typeof t.b == "number" && typeof t.a == "number";
}
function pf(e) {
	if (ff(e)) return {
		r: e.r,
		g: e.g,
		b: e.b,
		a: e.a
	};
	if (typeof e != "string") return;
	let t = e.trim().toLowerCase();
	if (t.length === 0) return;
	let n = _f[t];
	if (n !== void 0) return n;
	if (t.startsWith("#")) return mf(t);
	if (t.startsWith("rgb")) return hf(t);
}
function mf(e) {
	let t = e.slice(1);
	if ((t.length === 3 || t.length === 4) && (t = t.split("").map((e) => e + e).join("")), t.length !== 6 && t.length !== 8) return;
	let n = Number.parseInt(t, 16);
	if (!Number.isFinite(n)) return;
	let r = n >> 16 & 255, i = n >> 8 & 255, a = n & 255, o = t.length === 8 ? n >> 24 & 255 : 255;
	return {
		r: r / 255,
		g: i / 255,
		b: a / 255,
		a: o / 255
	};
}
function hf(e) {
	let t = e.indexOf("("), n = e.indexOf(")");
	if (t < 0 || n < 0) return;
	let r = e.slice(t + 1, n).split(",").map((e) => e.trim());
	if (r.length < 3) return;
	let i = [];
	for (let e = 0; e < r.length; e++) {
		let t = r[e], n = Number(t.replace("%", ""));
		if (!Number.isFinite(n)) return;
		t.includes("%") ? i.push(n / 100) : e === 3 ? i.push(n) : i.push(n / 255);
	}
	let [a, o, s, c = 1] = i;
	return {
		r: gf(a),
		g: gf(o),
		b: gf(s),
		a: gf(c)
	};
}
function gf(e) {
	return Math.min(Math.max(e, 0), 1);
}
var _f = {
	transparent: {
		r: 0,
		g: 0,
		b: 0,
		a: 0
	},
	black: {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	},
	white: {
		r: 1,
		g: 1,
		b: 1,
		a: 1
	},
	red: {
		r: 1,
		g: 0,
		b: 0,
		a: 1
	},
	green: {
		r: 0,
		g: .5,
		b: 0,
		a: 1
	},
	blue: {
		r: 0,
		g: 0,
		b: 1,
		a: 1
	},
	yellow: {
		r: 1,
		g: 1,
		b: 0,
		a: 1
	},
	cyan: {
		r: 0,
		g: 1,
		b: 1,
		a: 1
	},
	magenta: {
		r: 1,
		g: 0,
		b: 1,
		a: 1
	},
	orange: {
		r: 1,
		g: .65,
		b: 0,
		a: 1
	},
	gray: {
		r: .5,
		g: .5,
		b: .5,
		a: 1
	},
	grey: {
		r: .5,
		g: .5,
		b: .5,
		a: 1
	}
};
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUSurface.ts
function vf(e, t) {
	return Math.max(1, Math.round(e * t));
}
var yf = class {
	canvas;
	logicalW = 0;
	logicalH = 0;
	pixelRatio = 1;
	context = null;
	configured = !1;
	constructor(e) {
		this.canvas = e;
	}
	get logicalWidth() {
		return this.logicalW;
	}
	get logicalHeight() {
		return this.logicalH;
	}
	get dpr() {
		return this.pixelRatio;
	}
	get physicalWidth() {
		return this.canvas.width;
	}
	get physicalHeight() {
		return this.canvas.height;
	}
	getContext() {
		return this.context === null && (this.context = this.acquireContext()), this.context;
	}
	acquireContext() {
		let e = this.canvas.getContext("webgpu");
		if (e === null) throw new Fd("Canvas webgpu context is unavailable.", "context");
		return e;
	}
	configure(e, t) {
		let n = this.getContext(), r = typeof GPUTextureUsage < "u" ? GPUTextureUsage.RENDER_ATTACHMENT : 16, i = typeof GPUTextureUsage < "u" ? GPUTextureUsage.COPY_SRC : 1;
		n.configure({
			device: e,
			format: t,
			alphaMode: "premultiplied",
			usage: r | i
		}), this.configured = !0;
	}
	unconfigure() {
		this.context !== null && this.configured && (this.context.unconfigure(), this.configured = !1);
	}
	setLogicalSize(e, t, n = 1) {
		this.logicalW = e, this.logicalH = t, this.pixelRatio = n;
		let r = vf(e, n), i = vf(t, n), a = this.canvas.width !== r || this.canvas.height !== i;
		return a && (this.canvas.width = r, this.canvas.height = i), a;
	}
	getCurrentTexture() {
		return this.getContext().getCurrentTexture();
	}
};
function bf(e) {
	return new yf(e);
}
var xf = /* @__PURE__ */ function(e) {
	return e[e.Primitives = 0] = "Primitives", e[e.Glyphs = 1] = "Glyphs", e[e.Image = 2] = "Image", e;
}({}), Sf = [
	1,
	0,
	0,
	1,
	0,
	0
], Cf = cs(), wf = {
	x: 0,
	y: 0,
	width: 0,
	height: 0
}, Tf = class {
	data;
	length = 0;
	constructor(e) {
		this.data = new Float32Array(e);
	}
	reset() {
		this.length = 0;
	}
	ensure(e) {
		let t = this.length + e;
		if (t <= this.data.length) return;
		let n = this.data.length * 2;
		for (; n < t;) n *= 2;
		let r = new Float32Array(n);
		r.set(this.data.subarray(0, this.length)), this.data = r;
	}
	push4(e, t, n, r) {
		this.ensure(4);
		let i = this.length;
		this.data[i] = e, this.data[i + 1] = t, this.data[i + 2] = n, this.data[i + 3] = r, this.length = i + 4;
	}
	take() {
		return this.data.slice(0, this.length);
	}
}, Ef = new Tf(10240), Df = new Tf(32768), Of = new Tf(1024), kf = new Tf(768);
function Af() {
	return {
		atlas: new Jd(),
		shaper: new uf()
	};
}
function jf(e, t, n, r, i, a, o = typeof performance < "u" ? performance.now() : Date.now(), s = [], c = Af()) {
	let l = Ef, u = Df, d = Of, f = kf;
	l.reset(), u.reset(), d.reset(), f.reset();
	let p = [], m = [], { atlas: h, shaper: g } = c, _ = 0, v = null, y = {
		opacity: 1,
		ctm: [...Sf],
		clip: null,
		rounded: -1,
		cull: {
			x: 0,
			y: 0,
			width: r,
			height: i
		}
	}, b = [];
	function x() {
		let e = l.length / 20;
		e > _ && p.push({
			kind: 0,
			start: _,
			end: e,
			scissor: v
		}), _ = e;
	}
	function S(e) {
		if (_ === l.length / 20) {
			v = e;
			return;
		}
		Yf(v, e) || (x(), v = e);
	}
	function C(e) {
		let { lines: t, font: r, color: i, fontSize: o, originX: s, originY: c, ctm: l, scissor: d, rtl: f } = e, _ = e.opacity, v = e.rounded, y = h.styleFor(r, i, o, a, f), b = e.paint, S = e.request === void 0 ? void 0 : hc(e.request, n), C = e.request, w = (e) => e.length === 0 || C === void 0 ? 0 : n.measureRunWidth(e, C);
		for (let n of t) {
			if (n.text.length === 0) continue;
			let t = c + n.baselineY;
			if (n.runs !== void 0 && b !== void 0 && S !== void 0) {
				for (let r of n.runs) {
					if (r.text.length === 0) continue;
					let i = Rs(b, r.span), c = Ds(e.request, i), l = W(i?.color ?? b.textColor);
					C = S.requestAt(r.start), ee(r.text, s + r.x, t, r.width, n.height, c, l, h.styleFor(c, l, i?.fontSize ?? o, a, f), w);
				}
				continue;
			}
			ee(n.text, s + n.x, t, n.width, n.height, r, i, y, e.measureRun);
		}
		function ee(t, n, r, i, o, s, c, y, b) {
			let [S, C] = Vf(l, n, r), w = {
				text: t,
				font: s,
				color: c,
				x: S,
				y: C,
				width: i,
				height: o,
				opacity: e.opacity,
				instance: u.length / 16,
				glyphs: 0
			};
			m.push(w);
			for (let e of g.shape(t, s, i, b, f)) {
				if (e.blank) continue;
				let t = n + e.x, i = t * l[0] + r * l[2] + l[4], o = t * l[1] + r * l[3] + l[5], s = i * a, c = Math.floor(s), f = h.slotFor(y, e.text, e.advance, Yd(s - c));
				if (f === null) continue;
				x();
				let m = Lf(u, t + f.offsetX, r + f.offsetY, f.width, f.height, _, l, v, f, c / a - i, Math.round(o * a) / a - o), g = p[p.length - 1];
				g !== void 0 && g.kind === 1 && g.page === f.page && g.end === m && Yf(g.scissor, d) ? g.end = m + 1 : p.push({
					kind: 1,
					start: m,
					end: m + 1,
					page: f.page,
					scissor: d
				}), w.glyphs++;
			}
		}
	}
	function w(e, t, n, r, i) {
		return e.width <= 0 || e.height <= 0 ? !1 : t < e.x + e.width && e.x < t + r && n < e.y + e.height && e.y < n + i;
	}
	function ee(e, t) {
		if (t !== null) {
			for (let e of t) T(e);
			return;
		}
		let n = e.firstChild;
		for (; n !== null;) n.type === A.Fragment ? ee(n, null) : T(n), n = n.nextSibling;
	}
	function T(e, s = !1) {
		let c = t.recordFor(e);
		if (c === void 0 || !rs(e)) return;
		if (c.lifted && !s) {
			b.push({
				node: e,
				opacity: y.opacity,
				ctm: y.ctm
			});
			return;
		}
		let m = c.stickyOffsetX !== 0 || c.stickyOffsetY !== 0;
		if (y.cull !== null && !w(y.cull, c.x + c.stickyOffsetX, c.y + c.stickyOffsetY, c.width, c.height)) return;
		let h = $o(e, Cf), g = y.opacity * h.opacity, _ = m ? Bf(y.ctm, c.stickyOffsetX, c.stickyOffsetY) : y.ctm, v = h.hasTransform ? zf(_, Rf(c, h.transform)) : _, T = y.clip, te = y.rounded, ne = y.clip, D = y.rounded;
		if (c.clips) {
			let e = Kf(c, v, r, i, a);
			if (ne = e === null ? Wf() : y.clip === null ? e : Gf(y.clip, e), !kr(h.borderRadius)) {
				let e = Hf(v);
				e !== null && (D = d.length / 16, d.push4(c.x, c.y, c.width, c.height), d.push4(I(h.borderRadius), y.rounded, 0, 0), d.push4(e[0], e[1], e[2], e[3]), d.push4(e[4], e[5], 0, 0));
			}
		}
		let re = ne, ie = D;
		if (h.backgroundColor !== void 0) {
			let e = pf(h.backgroundColor);
			e !== void 0 && (S(T), Pf(l, c.x, c.y, c.width, c.height, e, I(h.borderRadius), g, 0, 0, v, te));
		}
		if (h.backgroundGradient !== void 0) {
			let e = Ff(f, h.backgroundGradient, c.width, c.height);
			if (e !== -1) {
				S(T);
				let t = h.backgroundGradient.stops[0].color;
				Pf(l, c.x, c.y, c.width, c.height, t, I(h.borderRadius), g, 0, 0, v, te, e);
			}
		}
		let ae = h.video !== void 0 && h.video.frame !== null ? h.video : h.image;
		if (ae !== void 0) {
			let e = h.video !== void 0 && h.video.frame !== null ? eo(h.video) : {
				width: h.image.width,
				height: h.image.height
			}, t = is(h.objectFit, e.width, e.height, c);
			if (t.width > 0 && t.height > 0) {
				let e = t.x < c.x || t.y < c.y || t.x + t.width > c.x + c.width || t.y + t.height > c.y + c.height, n = !kr(h.borderRadius), o = T, s = te;
				if (e || n) {
					let e = Kf(c, v, r, i, a);
					o = e === null ? Wf() : T === null ? e : Gf(T, e);
				}
				if (n) {
					let e = Hf(v);
					e !== null && (s = d.length / 16, d.push4(c.x, c.y, c.width, c.height), d.push4(I(h.borderRadius), te, 0, 0), d.push4(e[0], e[1], e[2], e[3]), d.push4(e[4], e[5], 0, 0));
				}
				x();
				let l = Lf(u, t.x, t.y, t.width, t.height, g, v, s, If), f = Math.hypot(v[0], v[1]) * a, m = Math.hypot(v[2], v[3]) * a;
				p.push({
					kind: 2,
					instance: l,
					scissor: o,
					source: ae,
					drawWidth: t.width * f,
					drawHeight: t.height * m
				});
			}
		}
		if (e.type === A.Paint) {
			let t = Zu.pictureFor(e, c, a);
			if (t !== void 0) {
				x();
				let e = Lf(u, c.x, c.y, c.width, c.height, g, v, te, If);
				p.push({
					kind: 2,
					instance: e,
					scissor: T,
					source: t,
					drawWidth: c.width * a,
					drawHeight: c.height * a
				});
			}
		}
		if (h.borderWidth > 0 && h.borderColor !== void 0) {
			let e = pf(h.borderColor);
			e !== void 0 && (S(T), Pf(l, c.x, c.y, c.width, c.height, e, I(h.borderRadius), g, h.borderWidth, 1, v, te));
		}
		let oe = (t, n) => {
			let r = I(h.borderRadius);
			for (let i of t) {
				if (i.after === "children" !== n) continue;
				let t = Du(e, i), a = t === void 0 ? void 0 : pf(t);
				if (a === void 0) continue;
				let o = Eu(i, c, r);
				o.width <= 0 || o.height <= 0 || i.kind === "stroke" && i.lineWidth <= 0 || (S(T), Pf(l, o.x, o.y, o.width, o.height, a, o.radius, g, i.kind === "stroke" ? i.lineWidth : 0, +(i.kind === "stroke"), v, te));
			}
		}, se = e.decorations;
		se !== null && ku(se, !1) && oe(se, !1);
		let ce = h.editor !== void 0 || h.text !== void 0 && h.text.length > 0, le = b.length;
		if (e.hasChildren()) {
			let t = {
				opacity: y.opacity,
				ctm: y.ctm,
				clip: y.clip,
				rounded: y.rounded,
				cull: y.cull
			};
			y.opacity = g, y.ctm = v, y.clip = ne, y.rounded = D, c.clips && y.cull !== null && (y.cull = Uf(y.cull, c)), (h.hasTransform || m) && (y.cull = null), c.scrollable && (y.ctm = Bf(y.ctm, -c.scrollX, -c.scrollY)), le = b.length, ee(e, c.paintOrder), y.opacity = t.opacity, y.ctm = t.ctm, y.clip = t.clip, y.rounded = t.rounded, y.cull = t.cull;
		}
		if (ce) {
			let t = $o(e, Cf);
			wf.x = 0, wf.y = 0, wf.width = Math.max(0, c.width - c.paddingLeft - c.paddingRight), wf.height = Math.max(0, c.height - c.paddingTop - c.paddingBottom);
			let r = c.x + c.paddingLeft - c.scrollX, i = c.y + c.paddingTop - c.scrollY, a = Es(t), s = ws(t.text ?? "", t, wf), u = (e) => e.length === 0 ? 0 : n.measureRunWidth(e, s), d = (e, n) => {
				C({
					lines: e,
					font: a,
					color: n,
					fontSize: t.fontSize,
					measureRun: u,
					rtl: t.rtl,
					originX: r,
					originY: i,
					ctm: v,
					opacity: g,
					rounded: ie,
					scissor: re,
					paint: t.spans === void 0 ? void 0 : t,
					request: s
				});
			}, f = (e) => {
				for (let t of e) {
					let e = pf(t.color);
					e !== void 0 && p(t, e);
				}
			}, p = (e, t) => {
				S(re), Pf(l, r + e.x, i + e.y, e.width, e.height, t, 0, g, 0, 0, v, ie);
			};
			if (t.editor !== void 0) {
				let e = t.editor, r = new Vs(e, wf, t, n);
				if (e.focused && !e.collapsed) {
					let e = pf(t.selectionColor);
					if (e !== void 0) for (let t of r.selectionBoxes()) p(t, e);
				}
				if (r.placeholderLines.length > 0 ? d(r.placeholderLines, W(t.placeholderColor)) : d(r.lines, W(t.textColor)), e.composing) {
					let n = pf(t.textColor);
					if (n !== void 0) {
						let t = r.lines[Ha(r.lines, e.composition.start)];
						for (let e of r.compositionBoxes()) p({
							x: e.x,
							y: Math.round(t.baselineY + 1),
							width: e.width,
							height: 1
						}, n);
					}
				}
				if (e.focused && e.collapsed && fo(e, o)) {
					let e = pf(t.caretColor);
					if (e !== void 0) {
						let t = r.caretRect();
						p({
							x: Math.round(t.x),
							y: t.y,
							width: 1,
							height: t.height
						}, e);
					}
				}
			} else {
				let e = Cs(wf, t, n);
				if (f(Ps(e, t)), t.textMatches !== void 0 || t.textSelection !== void 0) {
					let r = Cc(e, t.text, wf, t, n), i = t.textMatches === void 0 ? void 0 : pf(t.matchColor);
					if (i !== void 0) for (let e of t.textMatches) for (let t of Dc(r, e.start, e.end)) p(t, i);
					let a = t.textSelection === void 0 ? void 0 : pf(t.selectionColor);
					if (a !== void 0) for (let e of Dc(r, t.textSelection.start, t.textSelection.end)) p(e, a);
				}
				d(e, W(t.textColor)), f(Fs(e, t));
			}
		}
		se !== null && ku(se, !0) && ($o(e, Cf), oe(se, !0)), c.liftBoundary && E(le, ne, D), c.scrollable && (S(T), Nf(l, c, g, v, te, o));
	}
	function E(e = 0, t = null, n = -1) {
		if (b.length <= e) return;
		let r = {
			opacity: y.opacity,
			ctm: y.ctm,
			clip: y.clip,
			rounded: y.rounded,
			cull: y.cull
		};
		for (let r = e; r < b.length; r++) {
			let e = b[r];
			y.opacity = e.opacity, y.ctm = e.ctm, y.clip = t, y.rounded = n, y.cull = null, T(e.node, !0);
		}
		b.length = e, y.opacity = r.opacity, y.ctm = r.ctm, y.clip = r.clip, y.rounded = r.rounded, y.cull = r.cull;
	}
	T(e), E(), x();
	for (let e of s) switch (e.kind) {
		case "fill": {
			let t = Mf(e.color);
			t !== void 0 && (S(null), Pf(l, e.x, e.y, e.width, e.height, t, 0, 1, 0, 0, Sf, -1));
			break;
		}
		case "stroke": {
			let t = Mf(e.color);
			t !== void 0 && (S(null), Pf(l, e.x, e.y, e.width, e.height, t, 0, 1, e.lineWidth, 1, Sf, -1));
			break;
		}
		case "label": {
			let t = {
				x: 0,
				y: 0,
				width: 0,
				height: e.height
			}, r = {
				...cs(),
				text: e.text,
				fontSize: e.fontSize,
				fontFamily: e.fontFamily,
				lineHeight: e.height,
				textWrap: "none",
				verticalAlign: "middle"
			}, i = Cs(t, r, n);
			if (i.length === 0) break;
			let a = i[0].width + 8, o = wu(e), s = Mf(e.background);
			s !== void 0 && (S(null), Pf(l, o.x, o.y, a, e.height, s, 0, 1, 0, 0, Sf, -1));
			let c = ws(e.text, r, t);
			C({
				lines: i,
				font: e.font,
				color: e.textColor,
				rtl: !1,
				fontSize: e.fontSize,
				measureRun: (e) => e.length === 0 ? 0 : n.measureRunWidth(e, c),
				originX: o.x + 4,
				originY: o.y,
				ctm: Sf,
				opacity: 1,
				rounded: -1,
				scissor: null
			});
			break;
		}
	}
	return x(), {
		instanceData: l.take(),
		instanceCount: l.length / 20,
		texturedData: u.take(),
		texturedCount: u.length / 16,
		clipData: d.take(),
		clipCount: d.length / 16,
		gradientData: f.take(),
		gradientCount: f.length / 48,
		commands: p,
		textRuns: m
	};
}
function Mf(e) {
	let t = zn(e);
	return t === void 0 ? void 0 : pf(t);
}
function Nf(e, t, n, r, i, a) {
	let o = t.scrollbarVisibleUntil - a;
	if (o <= 0) return;
	let s = {
		r: .5,
		g: .5,
		b: .5,
		a: Math.min(1, o / 350) * .55
	}, { vertical: c, horizontal: l } = Nc(t);
	for (let t of [c, l]) {
		if (t === null) continue;
		let { x: a, y: o, width: c, height: l } = t.thumb;
		Pf(e, a, o, c, l, s, 3, n, 0, 0, r, i);
	}
}
function Pf(e, t, n, r, i, a, o, s, c, l, u, d, f = -1) {
	e.ensure(20);
	let p = e.data, m = e.length;
	p[m] = t, p[m + 1] = n, p[m + 2] = r, p[m + 3] = i, p[m + 4] = a.r, p[m + 5] = a.g, p[m + 6] = a.b, p[m + 7] = a.a, p[m + 8] = o, p[m + 9] = s, p[m + 10] = c, p[m + 11] = l, p[m + 12] = u[0], p[m + 13] = u[1], p[m + 14] = u[2], p[m + 15] = u[3], p[m + 16] = u[4], p[m + 17] = u[5], p[m + 18] = d, p[m + 19] = f, e.length = m + 20;
}
function Ff(e, t, n, r) {
	let i = Wr(t, n, r);
	if (i.kind === "radial" && !(i.radius > 0)) return -1;
	if (i.stops.length > 8) throw Error(`A gradient may carry at most 8 stops, got ${i.stops.length}.`);
	e.ensure(48);
	let a = e.data, o = e.length;
	a.fill(0, o, o + 48), a[o] = i.kind === "linear" ? 0 : 1, a[o + 1] = i.stops.length, a[o + 4] = i.x0, a[o + 5] = i.y0, i.kind === "linear" ? (a[o + 6] = i.x1, a[o + 7] = i.y1) : a[o + 6] = i.radius;
	for (let e = 0; e < i.stops.length; e++) {
		let t = i.stops[e], n = o + 8 + e * 4;
		a[n] = t.color.r, a[n + 1] = t.color.g, a[n + 2] = t.color.b, a[n + 3] = t.color.a, a[o + 40 + e] = t.offset;
	}
	return e.length = o + 48, o / 48;
}
var If = {
	u: 0,
	v: 0,
	uw: 1,
	vh: 1
};
function Lf(e, t, n, r, i, a, o, s, c, l = 0, u = 0) {
	e.ensure(16);
	let d = e.data, f = e.length;
	return d[f] = t, d[f + 1] = n, d[f + 2] = r, d[f + 3] = i, d[f + 4] = a, d[f + 5] = s, d[f + 6] = o[0], d[f + 7] = o[1], d[f + 8] = o[2], d[f + 9] = o[3], d[f + 10] = o[4] + l, d[f + 11] = o[5] + u, d[f + 12] = c.u, d[f + 13] = c.v, d[f + 14] = c.uw, d[f + 15] = c.vh, e.length = f + 16, f / 16;
}
function Rf(e, t) {
	let n = e.x + t.x, r = e.y + t.y, i = Math.cos(t.rotation), a = Math.sin(t.rotation), o = i * t.scaleX, s = a * t.scaleX, c = -a * t.scaleY, l = i * t.scaleY;
	return [
		o,
		s,
		c,
		l,
		n - n * o - r * c + t.translateX,
		r - n * s - r * l + t.translateY
	];
}
function zf(e, t) {
	return [
		e[0] * t[0] + e[2] * t[1],
		e[1] * t[0] + e[3] * t[1],
		e[0] * t[2] + e[2] * t[3],
		e[1] * t[2] + e[3] * t[3],
		e[0] * t[4] + e[2] * t[5] + e[4],
		e[1] * t[4] + e[3] * t[5] + e[5]
	];
}
function Bf(e, t, n) {
	return [
		e[0],
		e[1],
		e[2],
		e[3],
		e[4] + e[0] * t + e[2] * n,
		e[5] + e[1] * t + e[3] * n
	];
}
function Vf(e, t, n) {
	return [t * e[0] + n * e[2] + e[4], t * e[1] + n * e[3] + e[5]];
}
function Hf(e) {
	let t = e[0] * e[3] - e[1] * e[2];
	if (t === 0 || !Number.isFinite(t)) return null;
	let n = e[3] / t, r = -e[1] / t, i = -e[2] / t, a = e[0] / t;
	return [
		n + 0,
		r + 0,
		i + 0,
		a + 0,
		-(n * e[4] + i * e[5]) + 0,
		-(r * e[4] + a * e[5]) + 0
	];
}
function Uf(e, t) {
	let n = Math.min(e.x + e.width, t.x + t.width), r = Math.min(e.y + e.height, t.y + t.height), i = Math.max(e.x, t.x), a = Math.max(e.y, t.y);
	return {
		x: i + t.scrollX,
		y: a + t.scrollY,
		width: Math.max(0, n - i),
		height: Math.max(0, r - a)
	};
}
function Wf() {
	return {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	};
}
function Gf(e, t) {
	let n = Math.max(e.x, t.x), r = Math.max(e.y, t.y), i = Math.min(e.x + e.width, t.x + t.width), a = Math.min(e.y + e.height, t.y + t.height), o = Math.max(0, i - n), s = Math.max(0, a - r);
	return o <= 0 || s <= 0 ? Wf() : {
		x: n,
		y: r,
		width: o,
		height: s
	};
}
function Kf(e, t, n, r, i) {
	if (e.width <= 0 || e.height <= 0) return null;
	let a = Infinity, o = Infinity, s = -Infinity, c = -Infinity;
	for (let [n, r] of [
		[e.x, e.y],
		[e.x + e.width, e.y],
		[e.x, e.y + e.height],
		[e.x + e.width, e.y + e.height]
	]) {
		let [e, i] = Vf(t, n, r);
		a = Math.min(a, e), o = Math.min(o, i), s = Math.max(s, e), c = Math.max(c, i);
	}
	if (a = Math.max(0, a), o = Math.max(0, o), s = Math.min(n, s), c = Math.min(r, c), s - a <= 0 || c - o <= 0) return null;
	let l = vf(n, i), u = vf(r, i), d = qf(Math.round(a * i), 0, l), f = qf(Math.round(s * i), 0, l), p = qf(Math.round(o * i), 0, u), m = qf(Math.round(c * i), 0, u);
	return f <= d || m <= p ? null : {
		x: d,
		y: p,
		width: f - d,
		height: m - p
	};
}
function qf(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function Jf(e, t, n) {
	return {
		x: 0,
		y: 0,
		width: vf(e, n),
		height: vf(t, n)
	};
}
function Yf(e, t) {
	return e === t ? !0 : e === null || t === null ? !1 : e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUPipeline.ts
function Xf(e) {
	return e.createBindGroupLayout({ entries: [{
		binding: 0,
		visibility: ep(),
		buffer: { type: "read-only-storage" }
	}, {
		binding: 1,
		visibility: ep(),
		buffer: { type: "read-only-storage" }
	}] });
}
var Zf = new Float32Array([
	0,
	0,
	1,
	0,
	0,
	1,
	1,
	1
]), Qf = new Uint16Array([
	0,
	1,
	2,
	2,
	1,
	3
]), $f = () => typeof GPUShaderStage < "u" ? GPUShaderStage.VERTEX : 1, ep = () => typeof GPUShaderStage < "u" ? GPUShaderStage.FRAGMENT : 2, tp = {
	vertex: () => typeof GPUBufferUsage < "u" ? GPUBufferUsage.VERTEX : 32,
	index: () => typeof GPUBufferUsage < "u" ? GPUBufferUsage.INDEX : 16,
	uniform: () => typeof GPUBufferUsage < "u" ? GPUBufferUsage.UNIFORM : 64,
	copyDst: () => typeof GPUBufferUsage < "u" ? GPUBufferUsage.COPY_DST : 8
}, np = {
	color: {
		srcFactor: "src-alpha",
		dstFactor: "one-minus-src-alpha",
		operation: "add"
	},
	alpha: {
		srcFactor: "one",
		dstFactor: "one-minus-src-alpha",
		operation: "add"
	}
};
function rp(e, t, n) {
	let r = e.createShaderModule({ code: Vd }), i = e.createBindGroupLayout({ entries: [{
		binding: 0,
		visibility: $f() | ep(),
		buffer: { type: "uniform" }
	}] }), a = e.createRenderPipeline({
		layout: e.createPipelineLayout({ bindGroupLayouts: [i, n] }),
		vertex: {
			module: r,
			entryPoint: "vs",
			buffers: [op(), sp()]
		},
		fragment: {
			module: r,
			entryPoint: "fs",
			targets: [{
				format: t,
				blend: np
			}]
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "none"
		}
	});
	if (a === void 0) throw new Fd("Failed to create primitive render pipeline.", "pipeline");
	let { vertexBuffer: o, indexBuffer: s } = ap(e), c = e.createBuffer({
		size: 16,
		usage: tp.uniform() | tp.copyDst()
	}), l = e.createBindGroup({
		layout: i,
		entries: [{
			binding: 0,
			resource: { buffer: c }
		}]
	});
	return {
		pipeline: a,
		vertexBuffer: o,
		indexBuffer: s,
		indexCount: Qf.length,
		uniformBuffer: c,
		uniformBindGroup: l,
		uniformLayout: i
	};
}
function ip(e, t, n) {
	let r = e.createShaderModule({ code: Hd }), i = e.createBindGroupLayout({ entries: [
		{
			binding: 0,
			visibility: $f() | ep(),
			buffer: { type: "uniform" }
		},
		{
			binding: 1,
			visibility: ep(),
			sampler: { type: "filtering" }
		},
		{
			binding: 2,
			visibility: ep(),
			texture: {}
		}
	] }), a = e.createRenderPipeline({
		layout: e.createPipelineLayout({ bindGroupLayouts: [i, n] }),
		vertex: {
			module: r,
			entryPoint: "vs",
			buffers: [op(), cp()]
		},
		fragment: {
			module: r,
			entryPoint: "fs",
			targets: [{
				format: t,
				blend: np
			}]
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "none"
		}
	});
	if (a === void 0) throw new Fd("Failed to create textured render pipeline.", "pipeline");
	let { vertexBuffer: o, indexBuffer: s } = ap(e), c = e.createBuffer({
		size: 16,
		usage: tp.uniform() | tp.copyDst()
	});
	return {
		pipeline: a,
		vertexBuffer: o,
		indexBuffer: s,
		indexCount: Qf.length,
		uniformBuffer: c,
		bindGroupLayout: i,
		textSampler: e.createSampler({
			magFilter: "nearest",
			minFilter: "nearest"
		}),
		imageSampler: e.createSampler({
			magFilter: "linear",
			minFilter: "linear"
		})
	};
}
function ap(e) {
	let t = e.createBuffer({
		size: Zf.byteLength,
		usage: tp.vertex(),
		mappedAtCreation: !0
	});
	new Float32Array(t.getMappedRange()).set(Zf), t.unmap();
	let n = e.createBuffer({
		size: Qf.byteLength,
		usage: tp.index(),
		mappedAtCreation: !0
	});
	return new Uint16Array(n.getMappedRange()).set(Qf), n.unmap(), {
		vertexBuffer: t,
		indexBuffer: n
	};
}
function op() {
	return {
		arrayStride: 8,
		stepMode: "vertex",
		attributes: [{
			shaderLocation: 0,
			offset: 0,
			format: "float32x2"
		}]
	};
}
function sp() {
	return {
		arrayStride: 80,
		stepMode: "instance",
		attributes: [
			{
				shaderLocation: 1,
				offset: 0,
				format: "float32x2"
			},
			{
				shaderLocation: 2,
				offset: 8,
				format: "float32x2"
			},
			{
				shaderLocation: 3,
				offset: 16,
				format: "float32x4"
			},
			{
				shaderLocation: 4,
				offset: 32,
				format: "float32x3"
			},
			{
				shaderLocation: 5,
				offset: 44,
				format: "uint32"
			},
			{
				shaderLocation: 6,
				offset: 48,
				format: "float32x2"
			},
			{
				shaderLocation: 7,
				offset: 56,
				format: "float32x2"
			},
			{
				shaderLocation: 8,
				offset: 64,
				format: "float32x2"
			},
			{
				shaderLocation: 9,
				offset: 72,
				format: "float32"
			},
			{
				shaderLocation: 10,
				offset: 76,
				format: "float32"
			}
		]
	};
}
function cp() {
	return {
		arrayStride: 64,
		stepMode: "instance",
		attributes: [
			{
				shaderLocation: 1,
				offset: 0,
				format: "float32x2"
			},
			{
				shaderLocation: 2,
				offset: 8,
				format: "float32x2"
			},
			{
				shaderLocation: 3,
				offset: 16,
				format: "float32"
			},
			{
				shaderLocation: 4,
				offset: 20,
				format: "float32"
			},
			{
				shaderLocation: 5,
				offset: 24,
				format: "float32x2"
			},
			{
				shaderLocation: 6,
				offset: 32,
				format: "float32x2"
			},
			{
				shaderLocation: 7,
				offset: 40,
				format: "float32x2"
			},
			{
				shaderLocation: 8,
				offset: 48,
				format: "float32x2"
			},
			{
				shaderLocation: 9,
				offset: 56,
				format: "float32x2"
			}
		]
	};
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUTextureCache.ts
var lp = class {
	device;
	pipeline;
	images = /* @__PURE__ */ new WeakMap();
	scaled;
	constructor(e, t, n) {
		this.device = e, this.pipeline = t, this.scaled = new Fu(n);
	}
	imageBindGroup(e, t = 0, n = 0) {
		return $a(e) ? this.videoBindGroup(e) : this.stillBindGroup(e, t, n);
	}
	stillBindGroup(e, t, n) {
		let r = t > 0 && n > 0 ? this.scaled.resolve(e, t, n) : e, i = this.images.get(r);
		return i === void 0 ? this.upload(r, r, r.width, r.height, void 0)?.bindGroup ?? null : i.bindGroup;
	}
	videoBindGroup(e) {
		let t = e.frame;
		if (t === null) return null;
		let { width: n, height: r } = eo(e), i = this.images.get(e);
		if (i !== void 0) {
			if (i.version === e.version) return i.bindGroup;
			if (i.width === n && i.height === r) return i.version = e.version, this.copyInto(i.texture, t, n, r) ? i.bindGroup : null;
			i.texture.destroy(), this.images.delete(e);
		}
		return this.upload(e, t, n, r, e.version)?.bindGroup ?? null;
	}
	upload(e, t, n, r, i) {
		let a = Math.max(1, Math.round(n)), o = Math.max(1, Math.round(r)), s = up(this.device, a, o);
		if (!this.copyInto(s, t, a, o)) return s.destroy(), null;
		let c = {
			texture: s,
			bindGroup: dp(this.device, this.pipeline, s, this.pipeline.imageSampler),
			version: i,
			width: a,
			height: o
		};
		return this.images.set(e, c), c;
	}
	copyInto(e, t, n, r) {
		try {
			return this.device.queue.copyExternalImageToTexture({ source: t }, { texture: e }, [Math.max(1, Math.round(n)), Math.max(1, Math.round(r))]), !0;
		} catch {
			return !1;
		}
	}
	dispose() {
		this.scaled.dispose();
	}
};
function up(e, t, n) {
	let r = typeof GPUTextureUsage < "u" ? GPUTextureUsage.TEXTURE_BINDING : 4, i = typeof GPUTextureUsage < "u" ? GPUTextureUsage.COPY_DST : 8, a = typeof GPUTextureUsage < "u" ? GPUTextureUsage.RENDER_ATTACHMENT : 16;
	return e.createTexture({
		size: [t, n],
		format: "rgba8unorm",
		usage: r | i | a
	});
}
function dp(e, t, n, r) {
	return e.createBindGroup({
		layout: t.bindGroupLayout,
		entries: [
			{
				binding: 0,
				resource: { buffer: t.uniformBuffer }
			},
			{
				binding: 1,
				resource: r
			},
			{
				binding: 2,
				resource: n.createView()
			}
		]
	});
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPUGlyphPages.ts
var fp = class {
	device;
	pipeline;
	atlas;
	textures = [];
	bindGroups = [];
	scratch = null;
	scratchContext = null;
	uploads = 0;
	constructor(e, t, n) {
		this.device = e, this.pipeline = t, this.atlas = n;
	}
	flush() {
		for (let e of this.atlas.takeCleared()) this.textures[e]?.destroy(), this.textures[e] = null, this.bindGroups[e] = null;
		let e = this.atlas.takePending();
		for (let t of e) this.upload(t);
	}
	bindGroup(e) {
		let t = this.bindGroups[e];
		if (t != null) return t;
		let n = this.textureFor(e);
		if (n === null) return null;
		let r = dp(this.device, this.pipeline, n, this.pipeline.textSampler);
		return this.bindGroups[e] = r, r;
	}
	dispose() {
		for (let e of this.textures) e?.destroy();
		this.textures.length = 0, this.bindGroups.length = 0, this.scratch = null, this.scratchContext = null;
	}
	textureFor(e) {
		let t = this.textures[e];
		if (t != null) return t;
		let n = this.atlas.pageSize, r = up(this.device, n, n);
		return this.textures[e] = r, r;
	}
	upload(e) {
		let t = this.scratchFor(e.pixelWidth, e.pixelHeight);
		if (t === null) return;
		let n = this.textureFor(e.slot.page);
		n !== null && (t.setTransform(1, 0, 0, 1, 0, 0), t.clearRect(0, 0, e.pixelWidth, e.pixelHeight), t.scale(e.dpr, e.dpr), t.font = e.font, t.direction = e.rtl ? "rtl" : "ltr", t.fillStyle = e.color, t.textAlign = "left", t.textBaseline = "alphabetic", t.fillText(e.cluster, e.penX / e.dpr, e.penY / e.dpr), this.device.queue.copyExternalImageToTexture({ source: this.scratch }, {
			texture: n,
			origin: [e.pageX, e.pageY]
		}, [e.pixelWidth, e.pixelHeight]), this.uploads++);
	}
	scratchFor(e, t) {
		let n = this.scratch;
		if (n !== null && n.width >= e && n.height >= t) return this.scratchContext;
		let r = pp(Math.max(e, n?.width ?? 0), Math.max(t, n?.height ?? 0));
		return r === null ? null : (this.scratch = r, this.scratchContext = r.getContext("2d"), this.scratchContext);
	}
};
function pp(e, t) {
	if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(e, t);
	if (typeof document < "u") {
		let n = document.createElement("canvas");
		return n.width = e, n.height = t, n;
	}
	return null;
}
//#endregion
//#region packages/core/src/rendering/webgpu/WebGPURenderer.ts
var mp = typeof GPUBufferUsage < "u" ? GPUBufferUsage.VERTEX : 32, hp = typeof GPUBufferUsage < "u" ? GPUBufferUsage.STORAGE : 128, gp = typeof GPUBufferUsage < "u" ? GPUBufferUsage.COPY_DST : 8, _p = typeof GPUBufferUsage < "u" ? GPUBufferUsage.COPY_DST : 8, vp = typeof GPUBufferUsage < "u" ? GPUBufferUsage.MAP_READ : 1, yp = typeof GPUMapMode < "u" ? GPUMapMode.READ : 1, bp = class {
	backend = "webgpu";
	surface;
	hooks;
	device = null;
	format = null;
	primitives = null;
	textured = null;
	textures = null;
	glyphPages = null;
	textCache = Af();
	instanceBuffer = null;
	texturedBuffer = null;
	clipBuffer = null;
	gradientBuffer = null;
	frameLayout = null;
	frameBindGroup = null;
	cachedInstanceData = null;
	lastDraws = {
		primitiveDraws: 0,
		texturedDraws: 0,
		texturedInstances: 0
	};
	pendingCapture = null;
	lost = !1;
	disposed = !1;
	removeLostListener;
	onError;
	constructor(e) {
		this.surface = e.surface, this.hooks = e.hooks ?? {}, this.onError = e.onError ?? ((e) => console.error(e)), this.removeLostListener = zd((e) => {
			this.lost = !0, this.onError(`WebGPU device lost: ${e.reason} ${e.message}`);
		});
	}
	setHooks(e) {
		this.hooks = e;
	}
	async initialize() {
		if (this.disposed) throw new Fd("Renderer is disposed.", "disposed");
		let e = await Ld();
		this.disposed || (this.device = e.device, this.format = e.format, e.device.onuncapturederror = (e) => {
			this.onError(`WebGPU error: ${e.error.message}`);
		}, this.surface.configure(e.device, e.format), this.frameLayout = Xf(e.device), this.primitives = rp(e.device, e.format, this.frameLayout), this.textured = ip(e.device, e.format, this.frameLayout), this.textures = new lp(e.device, this.textured), this.glyphPages = new fp(e.device, this.textured, this.textCache.atlas), this.lost = !1);
	}
	get isReady() {
		return this.device !== null && this.format !== null && this.primitives !== null && this.textured !== null && !this.lost && !this.disposed;
	}
	get isLost() {
		return this.lost;
	}
	capture() {
		return new Promise((e, t) => {
			this.pendingCapture?.reject(/* @__PURE__ */ Error("Superseded by a later capture.")), this.pendingCapture = {
				resolve: e,
				reject: t
			};
		});
	}
	render(e, t) {
		if (!this.isReady) return;
		if (this.disposed) throw new Fd("Renderer is disposed.", "disposed");
		if (e.type === A.Root && !e.hasChildren()) {
			this.clearFrame();
			return;
		}
		let n = this.hooks.onPrepareStart !== void 0 || this.hooks.onPrepareEnd !== void 0 ? performance.now() : 0;
		this.textCache.atlas.beginFrame();
		let r = jf(e, t.layout, t.text, this.surface.logicalWidth, this.surface.logicalHeight, this.surface.dpr, t.now, t.overlay ?? [], this.textCache);
		this.hooks.onPrepareEnd !== void 0 && this.hooks.onPrepareEnd(performance.now() - n);
		let i = this.device, a = this.primitives, o = this.textured, s = this.textures, c = this.glyphPages;
		c.flush();
		let l = this.hooks.onUploadStart !== void 0 || this.hooks.onUploadEnd !== void 0 ? performance.now() : 0;
		if (r.instanceCount > 0) {
			let e = this.ensureBuffer(this.instanceBuffer, r.instanceData.byteLength, 80);
			e !== this.instanceBuffer && (this.instanceBuffer = e, this.cachedInstanceData = null), this.uploadInstanceData(r.instanceData);
		}
		r.texturedCount > 0 && (this.texturedBuffer = this.ensureBuffer(this.texturedBuffer, r.texturedData.byteLength, 64), i.queue.writeBuffer(this.texturedBuffer, 0, r.texturedData.buffer, 0, r.texturedData.byteLength));
		let u = this.ensureBuffer(this.clipBuffer, r.clipData.byteLength, 64, hp), d = this.ensureBuffer(this.gradientBuffer, r.gradientData.byteLength, 192, hp);
		(u !== this.clipBuffer || d !== this.gradientBuffer || this.frameBindGroup === null) && (this.clipBuffer = u, this.gradientBuffer = d, this.frameBindGroup = i.createBindGroup({
			layout: this.frameLayout,
			entries: [{
				binding: 0,
				resource: { buffer: u }
			}, {
				binding: 1,
				resource: { buffer: d }
			}]
		})), r.clipCount > 0 && i.queue.writeBuffer(u, 0, r.clipData.buffer, 0, r.clipData.byteLength), r.gradientCount > 0 && i.queue.writeBuffer(d, 0, r.gradientData.buffer, 0, r.gradientData.byteLength);
		let f = /* @__PURE__ */ new Float32Array(4);
		f[0] = this.surface.logicalWidth || 1, f[1] = this.surface.logicalHeight || 1, f[2] = this.surface.dpr || 1, i.queue.writeBuffer(a.uniformBuffer, 0, f), i.queue.writeBuffer(o.uniformBuffer, 0, f), this.hooks.onUploadEnd !== void 0 && this.hooks.onUploadEnd(performance.now() - l);
		let p = this.hooks.onEncodeStart !== void 0 || this.hooks.onEncodeEnd !== void 0 ? performance.now() : 0, m = i.createCommandEncoder(), h = this.surface.getCurrentTexture(), g = m.beginRenderPass({ colorAttachments: [{
			view: h.createView(),
			clearValue: {
				r: 0,
				g: 0,
				b: 0,
				a: 0
			},
			loadOp: "clear",
			storeOp: "store"
		}] }), _ = Jf(this.surface.logicalWidth, this.surface.logicalHeight, this.surface.dpr), v = null, y = null;
		g.setBindGroup(1, this.frameBindGroup), this.lastDraws.primitiveDraws = 0, this.lastDraws.texturedDraws = 0, this.lastDraws.texturedInstances = 0;
		let b = r.commands;
		for (let e = 0; e < b.length; e++) {
			let t = b[e], n = t.scissor ?? _;
			if (n.width <= 0 || n.height <= 0) continue;
			if (t.kind === xf.Primitives) {
				if (t.end <= t.start) continue;
				y !== xf.Primitives && (g.setPipeline(a.pipeline), g.setVertexBuffer(0, a.vertexBuffer), g.setVertexBuffer(1, this.instanceBuffer), g.setIndexBuffer(a.indexBuffer, "uint16"), g.setBindGroup(0, a.uniformBindGroup), y = xf.Primitives), v = xp(g, v, n), g.drawIndexed(a.indexCount, t.end - t.start, 0, 0, t.start), this.lastDraws.primitiveDraws++;
				continue;
			}
			let r = t.kind === xf.Glyphs, i = r ? c.bindGroup(t.page) : s.imageBindGroup(t.source, t.drawWidth, t.drawHeight);
			if (i === null) continue;
			y !== xf.Glyphs && (g.setPipeline(o.pipeline), g.setVertexBuffer(0, o.vertexBuffer), g.setVertexBuffer(1, this.texturedBuffer), g.setIndexBuffer(o.indexBuffer, "uint16"), y = xf.Glyphs), v = xp(g, v, n), g.setBindGroup(0, i);
			let l = r ? t.end - t.start : 1;
			l <= 0 || (g.drawIndexed(o.indexCount, l, 0, 0, r ? t.start : t.instance), this.lastDraws.texturedDraws++, this.lastDraws.texturedInstances += l);
		}
		g.end();
		let x = this.takeCapture(i, m, h);
		i.queue.submit([m.finish()]), x?.(), this.hooks.onEncodeEnd !== void 0 && this.hooks.onEncodeEnd(performance.now() - p);
	}
	takeCapture(e, t, n) {
		let r = this.pendingCapture;
		if (r === null) return null;
		this.pendingCapture = null;
		let i = n.width, a = n.height, o = Math.ceil(i * 4 / 256) * 256, s = e.createBuffer({
			size: o * a,
			usage: _p | vp
		});
		t.copyTextureToBuffer({ texture: n }, {
			buffer: s,
			bytesPerRow: o
		}, {
			width: i,
			height: a
		});
		let c = this.format === "bgra8unorm" || this.format === "bgra8unorm-srgb";
		return () => {
			s.mapAsync(yp).then(() => {
				let e = new Uint8Array(s.getMappedRange()), t = new Uint8ClampedArray(i * a * 4);
				for (let n = 0; n < a; n++) {
					let r = n * o, a = n * i * 4;
					for (let n = 0; n < i; n++) {
						let i = r + n * 4, o = a + n * 4;
						t[o] = e[c ? i + 2 : i], t[o + 1] = e[i + 1], t[o + 2] = e[c ? i : i + 2], t[o + 3] = e[i + 3];
					}
				}
				s.unmap(), s.destroy(), r.resolve({
					width: i,
					height: a,
					data: t
				});
			}).catch((e) => {
				s.destroy(), r.reject(e instanceof Error ? e : Error(String(e)));
			});
		};
	}
	clearFrame() {
		let e = this.device, t = e.createCommandEncoder(), n = this.surface.getCurrentTexture();
		t.beginRenderPass({ colorAttachments: [{
			view: n.createView(),
			clearValue: {
				r: 0,
				g: 0,
				b: 0,
				a: 0
			},
			loadOp: "clear",
			storeOp: "store"
		}] }).end(), e.queue.submit([t.finish()]);
	}
	resize(e, t, n = 1) {
		if (this.disposed) throw new Fd("Renderer is disposed.", "disposed");
		this.surface.setLogicalSize(e, t, n) && this.device !== null && this.format !== null && this.surface.configure(this.device, this.format);
	}
	fontsChanged() {
		this.textCache.shaper.clear(), this.textCache.atlas.reset(), this.glyphPages?.dispose();
	}
	dispose() {
		this.disposed || (this.disposed = !0, this.removeLostListener(), this.surface.unconfigure(), this.textures?.dispose(), this.textures = null, this.glyphPages?.dispose(), this.glyphPages = null, this.textCache.atlas.reset(), this.instanceBuffer?.destroy(), this.instanceBuffer = null, this.texturedBuffer?.destroy(), this.texturedBuffer = null, this.clipBuffer?.destroy(), this.clipBuffer = null, this.gradientBuffer?.destroy(), this.gradientBuffer = null, this.frameBindGroup = null, this.frameLayout = null, this.primitives = null, this.textured = null, this.device = null);
	}
	uploadInstanceData(e) {
		this.cachedInstanceData !== null && Sp(this.cachedInstanceData, e) || (this.device.queue.writeBuffer(this.instanceBuffer, 0, e.buffer, 0, e.byteLength), this.cachedInstanceData = new Float32Array(e));
	}
	ensureBuffer(e, t, n, r = mp) {
		if (e !== null && e.size >= t) return e;
		e?.destroy();
		let i = Math.max(Math.ceil(t * 1.5 / n) * n, n * 16);
		return this.device.createBuffer({
			size: i,
			usage: r | gp
		});
	}
};
function xp(e, t, n) {
	return t !== null && t.x === n.x && t.y === n.y && t.width === n.width && t.height === n.height ? t : (e.setScissorRect(n.x, n.y, n.width, n.height), n);
}
function Sp(e, t) {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
	return !0;
}
//#endregion
//#region packages/core/src/media/Mp4Demuxer.ts
var Cp = class {
	view;
	at = 0;
	constructor(e) {
		this.view = e;
	}
	get offset() {
		return this.at;
	}
	set offset(e) {
		this.at = e;
	}
	get remaining() {
		return this.view.byteLength - this.at;
	}
	u8() {
		let e = this.view.getUint8(this.at);
		return this.at += 1, e;
	}
	u16() {
		let e = this.view.getUint16(this.at);
		return this.at += 2, e;
	}
	u32() {
		let e = this.view.getUint32(this.at);
		return this.at += 4, e;
	}
	i32() {
		let e = this.view.getInt32(this.at);
		return this.at += 4, e;
	}
	u64() {
		let e = this.u32(), t = this.u32();
		return e * 4294967296 + t;
	}
	ascii(e) {
		let t = "";
		for (let n = 0; n < e; n++) t += String.fromCharCode(this.view.getUint8(this.at + n));
		return this.at += e, t;
	}
	bytes(e) {
		let t = this.view.byteOffset + this.at;
		return this.at += e, new Uint8Array(this.view.buffer.slice(t, t + e));
	}
	skip(e) {
		this.at += e;
	}
};
function wp(e, t) {
	if (e.remaining < 8 || e.offset + 8 > t) return null;
	let n = e.offset, r = e.u32(), i = e.ascii(4);
	r === 1 ? r = e.u64() : r === 0 && (r = t - n);
	let a = n + r;
	return r < 8 || a > t ? null : {
		type: i,
		start: e.offset,
		end: a
	};
}
function Q(e, t, n, r) {
	for (e.offset = t;;) {
		let t = wp(e, n);
		if (t === null) return;
		let i = t.end;
		if (r(t), e.offset = i, i >= n) return;
	}
}
function $(e) {
	let t = e.u8();
	return e.skip(3), t;
}
function Tp(e) {
	return {
		version: e.u8(),
		flags: e.u8() << 16 | e.u8() << 8 | e.u8()
	};
}
function Ep(e) {
	let { reader: t, moov: n, moofs: r, sawFtyp: i } = Dp(e);
	if (!i && n === null) throw Error("Not an MP4: no ftyp or moov box at the top level of the file.");
	if (n === null) throw Error("This MP4 has no moov box, so there is no sample table to read.");
	let a = Ap(t, n, "vide");
	if (a === null) throw Error("This MP4 has no video track, or none this demuxer recognises.");
	let o = kp(t, a, n, r);
	if (o.length === 0) throw Error(r.length > 0 ? "This fragmented MP4 has no samples for its video track. Its fragments may be in other files: this reads the fragments in the buffer it was given, not an index of segments to fetch." : "This MP4 video track has no samples.");
	let s = 0, c = Infinity;
	for (let e of o) s = Math.max(s, e.timestampUs + e.durationUs), e.durationUs > 0 && e.durationUs < c && (c = e.durationUs);
	return {
		codec: a.codec,
		codedWidth: a.codedWidth,
		codedHeight: a.codedHeight,
		description: a.description,
		samples: o,
		durationUs: s,
		frameDurationUs: Number.isFinite(c) ? c : 16667
	};
}
function Dp(e) {
	let t = new Cp(new DataView(e)), n = e.byteLength, r = null, i = [], a = !1;
	return Q(t, 0, n, (e) => {
		e.type === "ftyp" ? a = !0 : e.type === "moov" ? r = e : e.type === "moof" && i.push(e);
	}), {
		reader: t,
		moov: r,
		moofs: i,
		sawFtyp: a
	};
}
function Op(e) {
	if (e.length === 0) return e;
	let t = Infinity;
	for (let n of e) t = Math.min(t, n.timestampUs);
	return t <= 0 || !Number.isFinite(t) ? e : e.map((e) => ({
		...e,
		timestampUs: e.timestampUs - t
	}));
}
function kp(e, t, n, r) {
	let i = Bp(e, n);
	return Op(i.size === 0 && r.length === 0 ? Hp(t) : Vp(e, r, t, i));
}
function Ap(e, t, n) {
	let r = null;
	return Q(e, t.start, t.end, (t) => {
		if (t.type !== "trak" || r !== null) return;
		let i = jp(e, t, n);
		i !== null && (r = i);
	}), r;
}
function jp(e, t, n) {
	let r = null, i = 0;
	if (Q(e, t.start, t.end, (t) => {
		if (t.type === "tkhd") {
			let t = $(e);
			e.skip(t === 1 ? 16 : 8), i = e.u32();
			return;
		}
		t.type === "mdia" && (r = t);
	}), r === null) return null;
	let a = r, o = 0, s = !1, c = null;
	if (Q(e, a.start, a.end, (t) => {
		if (t.type === "mdhd") {
			$(e) === 1 ? (e.skip(16), o = e.u32()) : (e.skip(8), o = e.u32());
			return;
		}
		if (t.type === "hdlr") {
			$(e), e.skip(4), s = e.ascii(4) === n;
			return;
		}
		t.type === "minf" && (c = t);
	}), !s || c === null || o <= 0) return null;
	let l = null;
	if (Q(e, c.start, c.end, (e) => {
		e.type === "stbl" && (l = e);
	}), l === null) return null;
	let u = Mp(e, l, o, n);
	return u !== null && (u.trackId = i), u;
}
function Mp(e, t, n, r) {
	let i = {
		timescale: n,
		deltas: [],
		compositionOffsets: [],
		sizes: [],
		chunkOffsets: [],
		chunkRuns: [],
		syncSamples: [],
		codec: "",
		codedWidth: 0,
		codedHeight: 0,
		trackId: 0,
		sampleRate: 0,
		channels: 0,
		sampleSize: 0
	};
	return Q(e, t.start, t.end, (t) => {
		switch (t.type) {
			case "stsd":
				r === "soun" ? Pp(e, t, i) : Np(e, t, i);
				break;
			case "stts": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) {
					let t = e.u32(), n = e.u32();
					for (let e = 0; e < t; e++) i.deltas.push(n);
				}
				break;
			}
			case "ctts": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) {
					let t = e.u32(), n = e.i32();
					for (let e = 0; e < t; e++) i.compositionOffsets.push(n);
				}
				break;
			}
			case "stsz": {
				$(e);
				let t = e.u32(), n = e.u32();
				for (let r = 0; r < n; r++) i.sizes.push(t === 0 ? e.u32() : t);
				break;
			}
			case "stz2": {
				$(e), e.skip(3);
				let t = e.u8(), n = e.u32();
				for (let r = 0; r < n; r++) if (t === 16) i.sizes.push(e.u16());
				else if (t === 8) i.sizes.push(e.u8());
				else {
					let t = e.u8();
					i.sizes.push(t >> 4), r + 1 < n && (i.sizes.push(t & 15), r++);
				}
				break;
			}
			case "stsc": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) {
					let t = e.u32(), n = e.u32();
					e.skip(4), i.chunkRuns.push({
						firstChunk: t,
						samplesPerChunk: n
					});
				}
				break;
			}
			case "stco": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) i.chunkOffsets.push(e.u32());
				break;
			}
			case "co64": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) i.chunkOffsets.push(e.u64());
				break;
			}
			case "stss": {
				$(e);
				let t = e.u32();
				for (let n = 0; n < t; n++) i.syncSamples.push(e.u32());
				break;
			}
		}
	}), i.codec === "" ? null : i;
}
function Np(e, t, n) {
	if ($(e), e.u32() === 0) return;
	let r = wp(e, t.end);
	if (r === null) return;
	e.skip(6), e.skip(2), e.skip(16), n.codedWidth = e.u16(), n.codedHeight = e.u16(), e.skip(50);
	let i = r.type;
	Q(e, e.offset, r.end, (t) => {
		if (t.type === "avcC") {
			let r = e.bytes(t.end - t.start);
			n.description = r;
			let a = r[1] ?? 0, o = r[2] ?? 0, s = r[3] ?? 0;
			n.codec = `${i}.${zp(a)}${zp(o)}${zp(s)}`;
			return;
		}
		if (t.type === "hvcC") {
			n.description = e.bytes(t.end - t.start), n.codec = i;
			return;
		}
		if (t.type === "av1C") {
			let r = e.bytes(t.end - t.start);
			n.codec = Ip(i, r);
			return;
		}
		if (t.type === "vpcC") {
			let r = e.bytes(t.end - t.start);
			n.codec = Lp(i, r);
		}
	}), n.codec === "" && (n.codec = i);
}
function Pp(e, t, n) {
	if ($(e), e.u32() === 0) return;
	let r = wp(e, t.end);
	if (r === null) return;
	e.skip(6), e.skip(2);
	let i = e.u16();
	e.skip(6), n.channels = e.u16(), n.sampleSize = e.u16(), e.skip(2), e.skip(2), n.sampleRate = e.u16(), e.skip(2), i === 1 ? e.skip(16) : i === 2 && e.skip(36);
	let a = r.type;
	n.codec = a, Q(e, e.offset, r.end, (t) => {
		if (t.type === "esds") {
			Fp(e, t, n, a);
			return;
		}
		(t.type === "dOps" || t.type === "alac" || t.type === "dfLa") && (n.description = e.bytes(t.end - t.start));
	});
}
function Fp(e, t, n, r) {
	$(e);
	let i = t.end, a = () => {
		let t = 0;
		for (let n = 0; n < 4; n++) {
			let n = e.u8();
			if (t = t << 7 | n & 127, !(n & 128)) break;
		}
		return t;
	};
	for (; e.offset < i;) {
		let t = e.u8(), o = a(), s = e.offset + o;
		if (s > i) return;
		if (t === 3) {
			e.skip(2);
			let t = e.u8();
			t & 128 && e.skip(2), t & 64 && e.skip(e.u8()), t & 32 && e.skip(2);
			continue;
		}
		if (t === 4) {
			let t = e.u8();
			e.skip(12), n.codec = `${r}.${t.toString(16)}`;
			continue;
		}
		if (t === 5) {
			let t = e.bytes(o);
			n.description = t;
			let r = t[0];
			if (r !== void 0) {
				let e = r >> 3;
				e !== 0 && e !== 31 && (n.codec = `${n.codec}.${e}`);
			}
			return;
		}
		e.offset = s;
	}
}
function Ip(e, t) {
	let n = t[1], r = t[2];
	if (n === void 0 || r === void 0) return e;
	let i = n >> 5, a = n & 31, o = r & 128 ? "H" : "M", s = !!(r & 64), c = r & 32 && i === 2 ? 12 : s ? 10 : 8;
	return `${e}.${i}.${Rp(a)}${o}.${Rp(c)}`;
}
function Lp(e, t) {
	let n = t[4], r = t[5], i = t[6];
	return n === void 0 || r === void 0 || i === void 0 ? e : `${e}.${Rp(n)}.${Rp(r)}.${Rp(i >> 4)}`;
}
function Rp(e) {
	return e.toString(10).padStart(2, "0");
}
function zp(e) {
	return e.toString(16).padStart(2, "0").toUpperCase();
}
function Bp(e, t) {
	let n = /* @__PURE__ */ new Map();
	return Q(e, t.start, t.end, (t) => {
		t.type === "mvex" && Q(e, t.start, t.end, (t) => {
			if (t.type !== "trex") return;
			$(e);
			let r = e.u32();
			e.skip(4), n.set(r, {
				trackId: r,
				defaultSampleDuration: e.u32(),
				defaultSampleSize: e.u32(),
				defaultSampleFlags: e.u32()
			});
		});
	}), n;
}
function Vp(e, t, n, r) {
	let i = [], a = r.get(n.trackId), o = 0;
	for (let r of t) {
		let t = r.start - 8;
		Q(e, r.start, r.end, (r) => {
			if (r.type !== "traf") return;
			let s = 0, c = t, l = a?.defaultSampleDuration ?? 0, u = a?.defaultSampleSize ?? 0, d = a?.defaultSampleFlags ?? 0, f = [], p = null;
			if (Q(e, r.start, r.end, (t) => {
				if (t.type === "tfhd") {
					let { flags: t } = Tp(e);
					s = e.u32(), t & 1 && (c = e.u64()), t & 2 && e.skip(4), t & 8 && (l = e.u32()), t & 16 && (u = e.u32()), t & 32 && (d = e.u32());
					return;
				}
				if (t.type === "tfdt") {
					p = $(e) === 1 ? e.u64() : e.u32();
					return;
				}
				t.type === "trun" && f.push({
					header: t,
					at: t.start
				});
			}), s === n.trackId) {
				p !== null && (o = p);
				for (let t of f) {
					e.offset = t.at;
					let { version: r, flags: a } = Tp(e), s = e.u32(), f = c;
					a & 1 && (f += e.i32());
					let p = a & 4 ? e.u32() : null;
					for (let t = 0; t < s; t++) {
						let r = a & 256 ? e.u32() : l, s = a & 512 ? e.u32() : u, c = a & 1024 ? e.u32() : t === 0 && p !== null ? p : d, m = a & 2048 ? e.i32() : 0;
						i.push({
							offset: f,
							size: s,
							timestampUs: Math.round((o + m) * 1e6 / n.timescale),
							durationUs: Math.round(r * 1e6 / n.timescale),
							isKey: !(c & 65536)
						}), f += s, o += r;
					}
				}
			}
		});
	}
	return i;
}
function Hp(e) {
	let { sizes: t, chunkOffsets: n, chunkRuns: r, deltas: i, compositionOffsets: a, syncSamples: o, timescale: s } = e;
	if (t.length === 0 || n.length === 0 || r.length === 0) return [];
	let c = o.length === 0 ? null : new Set(o), l = [], u = 0, d = 0;
	for (let [e, o] of r.entries()) {
		let f = r[e + 1], p = f === void 0 ? n.length : f.firstChunk - 1;
		for (let e = o.firstChunk; e <= p; e++) {
			let r = n[e - 1];
			if (r !== void 0) for (let e = 0; e < o.samplesPerChunk && u < t.length; e++) {
				let e = t[u], n = i[u] ?? i[i.length - 1] ?? 0, o = a[u] ?? 0;
				l.push({
					offset: r,
					size: e,
					timestampUs: Math.round((d + o) * 1e6 / s),
					durationUs: Math.round(n * 1e6 / s),
					isKey: c === null || c.has(u + 1)
				}), r += e, d += n, u++;
			}
		}
	}
	return l;
}
//#endregion
//#region packages/core/src/media/ByteSource.ts
function Up(e) {
	return {
		size: e.byteLength,
		read(t, n) {
			return t < 0 || t + n > e.byteLength ? null : new Uint8Array(e, t, n);
		},
		request() {
			return Promise.resolve();
		},
		close() {}
	};
}
var Wp = 262144, Gp = 32;
function Kp(e, t) {
	let n = t.blockSize ?? 262144, r = t.capacity ?? Gp, i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = !1, s = (e) => Math.floor(e / n), c = (e, r) => {
		let a = new Uint8Array(r), o = e + a.length;
		for (let r = Math.ceil(e / n);; r++) {
			let s = r * n, c = Math.min(s + n, t.size);
			if (c > o || (i.set(r, a.subarray(s - e, c - e)), c === t.size)) break;
		}
	}, l = (e, t) => {
		for (i.delete(e), i.set(e, t); i.size > r;) {
			let e = i.keys().next();
			if (e.done === !0) break;
			i.delete(e.value);
		}
	}, u = (r) => {
		let i = a.get(r);
		if (i !== void 0) return i;
		let s = r * n, c = Math.min(s + n, t.size), u = t.fetchRange(e, s, c).then((e) => {
			o || l(r, new Uint8Array(e));
		}).finally(() => a.delete(r));
		return a.set(r, u), u;
	};
	return t.prefetched !== void 0 && c(t.prefetched.start, t.prefetched.data), {
		size: t.size,
		read(e, r) {
			if (e < 0 || r < 0 || e + r > t.size) return null;
			let a = s(e), o = s(e + Math.max(0, r - 1)), c = i.get(a);
			if (c === void 0) return null;
			if (a === o) return l(a, c), c.subarray(e - a * n, e - a * n + r);
			let u = new Uint8Array(r), d = 0;
			for (let t = a; t <= o; t++) {
				let a = i.get(t);
				if (a === void 0) return null;
				let o = t * n, s = Math.max(0, e - o), c = Math.min(a.length - s, r - d);
				u.set(a.subarray(s, s + c), d), d += c;
			}
			for (let e = a; e <= o; e++) {
				let t = i.get(e);
				t !== void 0 && l(e, t);
			}
			return d === r ? u : null;
		},
		async request(e, n) {
			if (o || e < 0 || e >= t.size) return;
			let r = s(e), a = s(Math.min(e + Math.max(0, n - 1), t.size - 1)), c = [];
			for (let e = r; e <= a; e++) i.has(e) || c.push(u(e));
			await Promise.all(c);
		},
		close() {
			o = !0, i.clear(), a.clear();
		}
	};
}
//#endregion
//#region packages/core/src/media/VideoResolver.ts
function qp() {
	return typeof VideoDecoder < "u" && typeof EncodedVideoChunk < "u";
}
var Jp = 4, Yp = 12, Xp = 1e5;
async function Zp(e) {
	let t = await fetch(e);
	if (!t.ok) throw Error(`Fetching '${e}' failed with ${t.status} ${t.statusText}.`);
	return t.arrayBuffer();
}
var Qp = class {
	entries = /* @__PURE__ */ new Map();
	evictable = [];
	capacity;
	fetchBuffer;
	fetchRange;
	disposed = !1;
	constructor(e = {}) {
		this.capacity = e.capacity ?? Jp, this.fetchBuffer = e.fetch ?? Zp, this.fetchRange = e.fetchRange;
	}
	get size() {
		return this.entries.size;
	}
	resolve(e) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ Error("The video resolver has been disposed."));
		let t = this.entries.get(e);
		if (t !== void 0) {
			t.holders++;
			let n = this.evictable.indexOf(e);
			return n !== -1 && this.evictable.splice(n, 1), t.playback;
		}
		let n = {
			source: e,
			holders: 1,
			settled: null,
			playback: this.open(e).then((t) => {
				let n = this.entries.get(e);
				return n === void 0 ? (t.close(), t) : (n.settled = t, t);
			})
		};
		return n.playback.catch(() => {}), this.entries.set(e, n), n.playback;
	}
	release(e) {
		let t = this.entries.get(e);
		if (t !== void 0 && (t.holders--, !(t.holders > 0))) for (this.evictable.push(e); this.evictable.length > this.capacity;) {
			let e = this.evictable.shift(), t = this.entries.get(e);
			t !== void 0 && t.holders === 0 && (this.entries.delete(e), t.settled?.close());
		}
	}
	dispose() {
		this.disposed = !0;
		for (let e of this.entries.values()) e.settled?.close();
		this.entries.clear(), this.evictable.length = 0;
	}
	async open(e) {
		if (!qp()) throw Error("This thread has no WebCodecs VideoDecoder, so video cannot be played here. It is available in Chrome 94+ and in a worker; Safari and Firefox support varies.");
		let t = this.fetchRange === void 0 ? await this.openWhole(e) : await this.openRanged(e), n = new tm(t.track, t.data);
		return await n.start(), n;
	}
	async openWhole(e) {
		let t = await this.fetchBuffer(e);
		return {
			track: Ep(t),
			data: Up(t)
		};
	}
	async openRanged(e) {
		let t = this.fetchRange, n = await t(e, 0, $p), r = n.total;
		if (!Number.isFinite(r) || r <= 0) throw Error(`Fetching a range of '${e}' did not report how long the file is.`);
		let i = (n, r) => t(e, n, r).then((e) => e.data), a = Kp(e, {
			fetchRange: (e, t, n) => i(t, n),
			size: r,
			prefetched: {
				start: 0,
				data: n.data
			}
		}), o = await em(a, "moov", r);
		if (o === null) throw Error(`'${e}' has no moov box, so there is no sample table to read. A ranged read walks the top-level boxes; a file this cannot walk is not an MP4.`);
		let s = a.read(o.start, o.end - o.start);
		return {
			track: Ep(s === null ? await i(o.start, o.end) : s.slice().buffer),
			data: a
		};
	}
}, $p = Wp;
async function em(e, t, n) {
	let r = 0;
	for (; r + 8 <= n;) {
		await e.request(r, 16);
		let i = e.read(r, Math.min(16, n - r));
		if (i === null || i.length < 8) return null;
		let a = new DataView(i.buffer, i.byteOffset, i.byteLength), o = a.getUint32(0), s = r + 8;
		if (o === 1) {
			if (i.length < 16) return null;
			o = a.getUint32(8) * 4294967296 + a.getUint32(12), s = r + 16;
		} else o === 0 && (o = n - r);
		if (o < 8 || r + o > n) return null;
		if (String.fromCharCode(i[4], i[5], i[6], i[7]) === t) return {
			start: s - 8,
			end: r + o
		};
		r += o;
	}
	return null;
}
var tm = class {
	track;
	data;
	surface;
	decoder;
	config = null;
	queue = [];
	nextSample = 0;
	positionUs = 0;
	closed = !1;
	errorListeners = /* @__PURE__ */ new Set();
	frameListeners = /* @__PURE__ */ new Set();
	syncPoints;
	seekTargetUs = null;
	pendingBytes = !1;
	constructor(e, t) {
		this.track = e, this.data = t, this.surface = new am(e.codedWidth, e.codedHeight, () => this.announcePicture()), this.syncPoints = nm(e.samples), this.decoder = new VideoDecoder({
			output: (e) => this.receive(e),
			error: (e) => this.fail(e)
		});
	}
	get width() {
		return this.track.codedWidth;
	}
	get height() {
		return this.track.codedHeight;
	}
	get duration() {
		return this.track.durationUs / 1e6;
	}
	get frameDurationMs() {
		return this.track.frameDurationUs / 1e3;
	}
	get positionMs() {
		return this.positionUs / 1e3;
	}
	get seeking() {
		return this.seekTargetUs !== null;
	}
	async start() {
		let e = {
			codec: this.track.codec,
			codedWidth: this.track.codedWidth,
			codedHeight: this.track.codedHeight,
			description: this.track.description,
			optimizeForLatency: !0
		};
		if ((await VideoDecoder.isConfigSupported(e)).supported !== !0) throw Error(`No decoder for '${this.track.codec}' at ${this.track.codedWidth}x${this.track.codedHeight} on this platform.`);
		this.config = e, this.decoder.configure(e), this.fill();
	}
	present(e) {
		if (this.closed) return !1;
		let t = Math.max(0, e * 1e3);
		if (t === this.positionUs) return !1;
		this.needsSeek(t) && this.seekTo(t), this.positionUs = t;
		let n = this.presentDue();
		return this.fill(), n;
	}
	onError(e) {
		return this.errorListeners.add(e), () => this.errorListeners.delete(e);
	}
	onFrame(e) {
		return this.frameListeners.add(e), () => this.frameListeners.delete(e);
	}
	close() {
		if (!this.closed) {
			this.closed = !0;
			for (let e of this.queue) e.close();
			this.queue.length = 0, this.surface.clear(), this.decoder.state !== "closed" && this.decoder.close(), this.errorListeners.clear(), this.frameListeners.clear(), this.data.close();
		}
	}
	presentDue() {
		let e = !1;
		for (; this.queue.length > 0;) {
			let t = this.queue[0];
			if (t.timestamp > this.positionUs) break;
			this.queue.shift();
			let n = this.queue[0];
			if (n !== void 0 && n.timestamp <= this.positionUs) {
				t.close();
				continue;
			}
			this.surface.show(t), e = !0;
		}
		return e;
	}
	fill() {
		if (!(this.closed || this.decoder.state !== "configured")) for (; this.nextSample < this.track.samples.length && this.queue.length + this.decoder.decodeQueueSize < Yp;) {
			let e = this.track.samples[this.nextSample], t = this.data.read(e.offset, e.size);
			if (t === null) {
				this.await(e);
				return;
			}
			this.nextSample++;
			try {
				this.decoder.decode(new EncodedVideoChunk(im(e, t)));
			} catch (e) {
				this.fail(e);
				return;
			}
		}
	}
	await(e) {
		if (this.pendingBytes) return;
		let t = this.track.samples[Math.min(this.nextSample + Yp, this.track.samples.length - 1)], n = t === void 0 ? e.offset + e.size : t.offset + t.size;
		this.pendingBytes = !0, this.data.request(e.offset, Math.max(e.size, n - e.offset)).then(() => {
			this.pendingBytes = !1, !this.closed && (this.fill(), this.announceFrame());
		}).catch((e) => {
			this.pendingBytes = !1, this.fail(e);
		});
	}
	needsSeek(e) {
		return e + Xp < this.positionUs ? !0 : e <= this.positionUs ? !1 : rm(this.syncPoints, e) > this.nextSample;
	}
	seekTo(e) {
		for (let e of this.queue) e.close();
		this.queue.length = 0, this.nextSample = rm(this.syncPoints, e), this.seekTargetUs = e > 0 ? e : null, this.config !== null && this.decoder.state !== "closed" && (this.decoder.reset(), this.decoder.configure(this.config));
	}
	receive(e) {
		if (this.closed) {
			e.close();
			return;
		}
		let t = this.seekTargetUs;
		if (t !== null) {
			if (e.timestamp + this.track.frameDurationUs < t) {
				e.close(), this.fill();
				return;
			}
			if (this.enqueue(e), !(e.timestamp >= t || this.nextSample >= this.track.samples.length)) {
				this.fill();
				return;
			}
			this.seekTargetUs = null, this.announceFrame();
			return;
		}
		this.enqueue(e), this.announceFrame();
	}
	enqueue(e) {
		this.queue.push(e), this.queue.sort((e, t) => e.timestamp - t.timestamp);
	}
	announceFrame() {
		this.presentDue();
	}
	announcePicture() {
		for (let e of this.frameListeners) e();
	}
	fail(e) {
		for (let t of this.errorListeners) t(e);
		this.close();
	}
};
function nm(e) {
	let t = [];
	for (let [n, r] of e.entries()) r.isKey && t.push({
		timestampUs: r.timestampUs,
		sample: n
	});
	return t.sort((e, t) => e.timestampUs - t.timestampUs), t;
}
function rm(e, t) {
	let n = 0, r = e.length - 1, i = 0;
	for (; n <= r;) {
		let a = n + r >> 1, o = e[a];
		o.timestampUs <= t ? (i = o.sample, n = a + 1) : r = a - 1;
	}
	return i;
}
function im(e, t) {
	return {
		type: e.isKey ? "key" : "delta",
		timestamp: e.timestampUs,
		duration: e.durationUs,
		data: t
	};
}
var am = class {
	width;
	height;
	onPicture;
	frame = null;
	version = 0;
	constructor(e, t, n = () => {}) {
		this.width = e, this.height = t, this.onPicture = n;
	}
	pending = 0;
	show(e) {
		let t = ++this.pending;
		if (typeof createImageBitmap != "function") {
			this.replace(e);
			return;
		}
		createImageBitmap(e).then((n) => {
			if (e.close(), t !== this.pending) {
				n.close();
				return;
			}
			this.replace(n);
		}).catch(() => {
			if (t !== this.pending) {
				e.close();
				return;
			}
			this.replace(e);
		});
	}
	replace(e) {
		this.frame?.close?.(), this.frame = e, this.version++, this.onPicture();
	}
	clear() {
		this.pending++, this.frame?.close?.(), this.frame = null, this.version++;
	}
}, om = "gesso", sm = lm(), cm = typeof performance < "u" && typeof performance.measure == "function" && typeof performance.now == "function";
function lm() {
	return globalThis.__GESSO_PERF__ === !0;
}
function um(e) {
	sm = e;
}
function dm() {
	return sm && cm;
}
function fm(e, t, n, r) {
	if (!(!sm || !cm)) try {
		performance.measure(`${om} ${e}`, {
			start: t,
			end: n,
			...r === void 0 ? {} : { detail: r }
		});
	} catch {}
}
function pm() {
	return cm ? performance.now() : Date.now();
}
//#endregion
//#region packages/core/src/scheduler/UiFrame.ts
var mm = class {
	id;
	time;
	dirty;
	constructor(e, t, n) {
		this.id = e, this.time = t, this.dirty = n;
	}
	get nodes() {
		return [...this.dirty.keys()];
	}
	entries() {
		return this.dirty.entries();
	}
	anyFlags(e) {
		for (let t of this.dirty.values()) if ((t & e) !== 0) return !0;
		return !1;
	}
	get size() {
		return this.dirty.size;
	}
	isEmpty() {
		return this.dirty.size === 0;
	}
	dirtyFlagsFor(e) {
		return this.dirty.get(e) ?? k.None;
	}
}, hm = class {
	clock;
	dirty;
	onFrame;
	beforeCollect;
	disposed = !1;
	active = !0;
	pending = !1;
	collecting = !1;
	frames = 0;
	drained = [];
	constructor(e) {
		this.dirty = e.dirty, this.onFrame = e.onFrame, this.beforeCollect = e.beforeCollect, this.clock = e.clock((e) => {
			this.handleFrame(e);
		});
	}
	notifyDirty() {
		this.collecting || this.wake();
	}
	wake() {
		this.disposed || !this.active || this.pending || (this.pending = !0, this.clock.requestFrame());
	}
	start() {
		if (this.disposed) throw Error("UiScheduler is disposed.");
		this.active || (this.active = !0, this.dirty.isEmpty() || this.notifyDirty());
	}
	stop() {
		this.active && (this.active = !1, this.pending = !1, this.clock.cancelFrame());
	}
	dispose() {
		this.disposed || (this.disposed = !0, this.active = !1, this.pending = !1, this.clock.cancelFrame());
	}
	get running() {
		return this.active;
	}
	get framePending() {
		return this.pending;
	}
	get frameCount() {
		return this.frames;
	}
	flush(e) {
		this.disposed || !this.active || (this.clock.cancelFrame(), this.pending = !1, this.handleFrame(e));
	}
	handleFrame(e) {
		let t = dm(), n = t ? pm() : 0;
		this.pending = !1, this.collecting = !0;
		let r, i = 0;
		try {
			this.beforeCollect?.(e), t && (i = pm(), fm("before collect", n, i)), r = this.collectFrame(e);
		} finally {
			this.collecting = !1;
		}
		let a = 0;
		if (t && (a = pm(), fm("collect", i, a)), r.size > 0 && this.onFrame(r), t) {
			let e = pm(), t = {
				frame: r.id,
				nodes: r.size
			};
			fm("process", a, e, t), fm("frame", n, e, t);
		}
		this.dirty.isEmpty() || this.notifyDirty();
	}
	collectFrame(e) {
		let t = this.dirty.drainInto(this.drained), n = /* @__PURE__ */ new Map();
		for (let e = 0; e < t; e++) {
			let t = this.drained[e];
			n.set(t, t.dirtyFlags), t.dirtyFlags = k.None;
		}
		let r = new mm(this.frames, e, n);
		return n.size > 0 && this.frames++, r;
	}
}, gm = class {
	onFrame;
	requestAnimationFrame;
	cancelAnimationFrame;
	handle = null;
	constructor(e) {
		this.onFrame = e;
		let t = globalThis;
		if (typeof t.requestAnimationFrame != "function" || typeof t.cancelAnimationFrame != "function") throw Error("requestAnimationFrame is not available in this environment.");
		this.requestAnimationFrame = t.requestAnimationFrame.bind(t), this.cancelAnimationFrame = t.cancelAnimationFrame.bind(t);
	}
	requestFrame() {
		this.handle === null && (this.handle = this.requestAnimationFrame((e) => {
			this.handle = null, this.onFrame(e);
		}));
	}
	cancelFrame() {
		this.handle !== null && (this.cancelAnimationFrame(this.handle), this.handle = null);
	}
}, _m = class {
	onFrame;
	intervalMs;
	now;
	handle = null;
	constructor(e, t = {}) {
		this.onFrame = e, this.intervalMs = t.intervalMs ?? 16, this.now = t.now ?? (() => performance.now());
	}
	requestFrame() {
		this.handle === null && (this.handle = setTimeout(() => {
			this.handle = null, this.onFrame(this.now());
		}, this.intervalMs));
	}
	cancelFrame() {
		this.handle !== null && (clearTimeout(this.handle), this.handle = null);
	}
}, vm = 500, ym = 4, bm = class {
	host;
	hitTester;
	platform;
	paint = cs();
	anchor = null;
	focus = null;
	dragging = !1;
	order = [];
	painted = [];
	lastPress = null;
	pendingLink = null;
	hoveredLink = null;
	constructor(e, t, n = {}) {
		this.host = e, this.hitTester = t, this.platform = n.platform ?? Hs();
	}
	get hasSelection() {
		return this.painted.length > 0;
	}
	isSelectable(e) {
		return Ao(e) !== void 0;
	}
	pointerDown(e, t, n, r) {
		if (this.pendingLink = null, e === null) return this.clear(), !1;
		let i = this.geometryOf(e), a = this.hitTester.toLocal(e, t, n);
		if (vo(e)) {
			let r = bo(i, a.x, a.y);
			yo(e, r) !== void 0 && (this.pendingLink = {
				node: e,
				index: r,
				x: t,
				y: n
			});
		}
		if (!this.isSelectable(e) || !Tc(i)) return this.clear(), this.pendingLink !== null;
		let o = Ec(i, a.x, a.y), s = this.host.now(), c = this.lastPress, l = !r.shift && c !== null && c.node === e && s - c.at <= vm && Math.abs(c.x - t) <= ym && Math.abs(c.y - n) <= ym ? c.count + 1 : 1;
		if (this.lastPress = {
			node: e,
			x: t,
			y: n,
			at: s,
			count: l
		}, this.host.blurEditable(), this.order = Mo(this.host.root()), this.dragging = !0, r.shift && this.anchor !== null) this.focus = {
			node: e,
			offset: o
		};
		else if (l === 2) {
			let t = Oc(i, o);
			this.anchor = {
				node: e,
				offset: t.start
			}, this.focus = {
				node: e,
				offset: t.end
			};
		} else l >= 3 ? (this.anchor = {
			node: e,
			offset: Pa(i.text, o)
		}, this.focus = {
			node: e,
			offset: Fa(i.text, o)
		}) : (this.anchor = {
			node: e,
			offset: o
		}, this.focus = {
			node: e,
			offset: o
		});
		return this.apply(), !0;
	}
	pointerMove(e, t) {
		if (this.pendingLink !== null && (Math.abs(e - this.pendingLink.x) > ym || Math.abs(t - this.pendingLink.y) > ym) && (this.pendingLink = null), !this.dragging || this.anchor === null) return;
		let n = this.pointAt(e, t);
		n !== null && (this.focus === null || this.focus.node !== n.node || this.focus.offset !== n.offset) && (this.focus = n, this.apply());
	}
	pointerUp() {
		this.dragging = !1;
		let e = this.pendingLink;
		this.pendingLink = null, e !== null && (this.anchor === null || this.focus === null || this.anchor.offset === this.focus.offset) && yo(e.node, e.index)?.onClick?.();
	}
	pointerHover(e, t, n) {
		let r = null, i = -1;
		if (e !== null && vo(e)) {
			let a = this.hitTester.toLocal(e, t, n), o = bo(this.geometryOf(e), a.x, a.y);
			yo(e, o) !== void 0 && (r = e, i = o);
		}
		this.hoveredLink !== null && this.hoveredLink !== r && _o(this.hoveredLink) && this.host.markDirty(this.hoveredLink, k.Paint), this.hoveredLink = r, r !== null && go(r, i) && this.host.markDirty(r, k.Paint);
	}
	handleKey(e, t) {
		let n = this.platform === "mac" ? t.meta : t.ctrl;
		if (n && (e === "c" || e === "C")) {
			let e = this.selectedText();
			return e.length !== 0 && (this.host.copy(e), !0);
		}
		return n && (e === "a" || e === "A") ? this.selectAll() : e === "Escape" && this.hasSelection ? (this.clear(), !0) : !1;
	}
	selectAll() {
		let e = Mo(this.host.root());
		if (e.length === 0) return !1;
		let t = e[0], n = e[e.length - 1];
		return this.order = e, this.anchor = {
			node: t,
			offset: 0
		}, this.focus = {
			node: n,
			offset: this.geometryOf(n).end
		}, this.apply(), !0;
	}
	selectRange(e, t, n) {
		return Ao(e) === void 0 || (this.order = Mo(this.host.root()), !this.order.includes(e)) ? !1 : (this.anchor = {
			node: e,
			offset: t
		}, this.focus = {
			node: e,
			offset: n
		}, this.lastPress = null, this.apply(), this.hasSelection);
	}
	selectedText() {
		let e = [];
		for (let t of this.painted) {
			let n = Do(t), r = Ao(t);
			n !== void 0 && r !== void 0 && e.push(r.slice(n.start, n.end));
		}
		return e.join("\n");
	}
	clear() {
		if (this.anchor = null, this.focus = null, this.dragging = !1, this.painted.length !== 0) {
			for (let e of this.painted) ko(e) && this.host.markDirty(e, k.Paint);
			this.painted = [];
		}
	}
	handleNodeRemoved(e) {
		this.hoveredLink === e && (this.hoveredLink = null), this.pendingLink?.node === e && (this.pendingLink = null), (this.painted.includes(e) || this.anchor?.node === e || this.focus?.node === e) && this.clear();
	}
	pointAt(e, t) {
		let n = this.hitTester.hitTest(e, t);
		if (n !== null && this.isSelectable(n.node)) {
			let r = this.geometryOf(n.node);
			if (Tc(r)) {
				let i = this.hitTester.toLocal(n.node, e, t);
				return {
					node: n.node,
					offset: Ec(r, i.x, i.y)
				};
			}
		}
		let r = this.nearestNode(e, t);
		if (r === null) return null;
		let i = this.geometryOf(r);
		if (!Tc(i)) return null;
		let a = this.hitTester.toLocal(r, e, t);
		return {
			node: r,
			offset: Ec(i, a.x, a.y)
		};
	}
	nearestNode(e, t) {
		let n = null, r = Infinity;
		for (let i of this.order) {
			if (this.host.recordFor(i) === void 0) continue;
			let a = this.host.visibleBox(i), o = Math.max(a.x - e, 0, e - (a.x + a.width)), s = Math.max(a.y - t, 0, t - (a.y + a.height)), c = s * s * 4 + o * o;
			c < r && (r = c, n = i);
		}
		return n;
	}
	apply() {
		let e = this.anchor, t = this.focus;
		if (e === null || t === null) {
			this.clear();
			return;
		}
		let n = this.order.indexOf(e.node), r = this.order.indexOf(t.node);
		if (n < 0 || r < 0) {
			this.clear();
			return;
		}
		let i = n < r || n === r && e.offset <= t.offset, a = i ? e : t, o = i ? t : e, s = Math.min(n, r), c = Math.max(n, r), l = [];
		for (let e = s; e <= c; e++) {
			let t = this.order[e], n = this.geometryOf(t).end, r = e === s ? Math.min(a.offset, n) : 0, i = e === c ? Math.min(o.offset, n) : n;
			i <= r || (Oo(t, r, i) && this.host.markDirty(t, k.Paint), l.push(t));
		}
		for (let e of this.painted) !l.includes(e) && ko(e) && this.host.markDirty(e, k.Paint);
		this.painted = l;
	}
	geometryOf(e) {
		let t = this.host.recordFor(e), n = $o(e, this.paint), r = t === void 0 ? {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		} : {
			x: t.paddingLeft,
			y: t.paddingTop,
			width: Math.max(0, t.width - t.paddingLeft - t.paddingRight),
			height: Math.max(0, t.height - t.paddingTop - t.paddingBottom)
		};
		return Sc(n.text ?? "", r, n, this.host.measurer);
	}
}, xm = {
	[A.Button]: "button",
	[A.EditableText]: "textbox"
}, Sm = /* @__PURE__ */ new Set([
	"button",
	"checkbox",
	"image",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"progressbar",
	"radio",
	"separator",
	"slider",
	"switch",
	"tab"
]);
function Cm(e) {
	return Tm(e, null, !1);
}
function wm(e, t, n, r) {
	let i = Tm(e, t, r), a = i.get(e.id);
	return a === void 0 ? null : (i.set(e.id, {
		...a,
		index: n
	}), i);
}
function Tm(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = (e) => {
		let t = i.get(e) ?? 0;
		return i.set(e, t + 1), t;
	}, o = (e, t, n) => {
		if (e.properties.get("visible") === !1) return;
		let i = n || e.properties.get("disabled") === !0, s = Dm(e, t, i, a);
		if (s === null) {
			for (let n = e.firstChild; n !== null; n = n.nextSibling) o(n, t, i);
			return;
		}
		let c = Fm(e);
		c.length > 0 ? (r.set(s.id, Lm(s)), Rm(e, s.id, c, r)) : r.set(s.id, s);
		for (let t = e.firstChild; t !== null; t = t.nextSibling) jm(e, t) || o(t, s.id, i);
	};
	return o(e, t, n), r;
}
function Em(e) {
	for (let t = e.parent; t !== null; t = t.parent) if (t.properties.get("disabled") === !0) return !0;
	return !1;
}
function Dm(e, t, n, r) {
	let i = e.properties.get("role") ?? xm[e.type], a = e.properties.get("label"), o = e.type === A.Text;
	if (i === void 0 && a === void 0 && !o) return null;
	let s = a ?? km(e);
	if (i === void 0 && a === void 0 && s === void 0) return null;
	let c = e.properties.get("states");
	return Mm({
		id: e.id,
		parent: t,
		index: r(t),
		role: i,
		label: s,
		description: e.properties.get("description"),
		live: e.properties.get("live"),
		states: c === void 0 || c.length === 0 ? void 0 : di(c),
		disabled: n ? !0 : void 0,
		valueNow: e.properties.get("valueNow"),
		valueMin: e.properties.get("valueMin"),
		valueMax: e.properties.get("valueMax"),
		valueText: Om(e),
		posInSet: e.properties.get("posInSet"),
		setSize: e.properties.get("setSize"),
		level: e.properties.get("level")
	});
}
function Om(e) {
	let t = e.properties.get("valueText");
	if (t !== void 0) return t;
	if (e.type === A.EditableText) return e.properties.get("value") ?? "";
}
function km(e) {
	if (e.type === A.EditableText) return;
	let t = [], n = Jn(e);
	n.length > 0 && t.push(n);
	for (let n = e.firstChild; n !== null; n = n.nextSibling) {
		if (!Am(n)) continue;
		let e = km(n);
		e !== void 0 && t.push(e);
	}
	let r = t.join(" ").trim();
	return r.length > 0 ? r : void 0;
}
function Am(e) {
	return e.properties.get("visible") === !1 || e.properties.get("role") !== void 0 || e.properties.get("label") !== void 0 ? !1 : xm[e.type] === void 0;
}
function jm(e, t) {
	let n = e.properties.get("role") ?? xm[e.type];
	return n !== void 0 && Sm.has(n) ? !0 : e.properties.get("label") === void 0 && Am(t) && km(t) !== void 0;
}
function Mm(e) {
	let t = {};
	for (let [n, r] of Object.entries(e)) r !== void 0 && (t[n] = r);
	return t;
}
var Nm = "#run";
function Pm(e) {
	let t = e.lastIndexOf(Nm);
	if (t < 0) return null;
	let n = Number(e.slice(t + 4));
	return Number.isInteger(n) && n >= 0 ? {
		nodeId: e.slice(0, t),
		index: n
	} : null;
}
function Fm(e) {
	let t = Yn(e);
	for (let e of t) if (e.link !== void 0) return t;
	return Im;
}
var Im = [];
function Lm(e) {
	let { label: t, ...n } = e;
	return {
		...n,
		role: e.role ?? "paragraph"
	};
}
function Rm(e, t, n, r) {
	let i = Jn(e), a = 0, o = (n, o, s) => {
		let c = i.slice(n, o);
		if (s === void 0 && c.trim().length === 0) return;
		let l = `${e.id}${Nm}${a}`;
		r.set(l, {
			id: l,
			parent: t,
			index: a,
			role: s === void 0 ? void 0 : "link",
			label: s?.label ?? c
		}), a++;
	}, s = 0;
	for (let e of n) e.link !== void 0 && (o(s, e.start, void 0), o(e.start, e.end, e.link), s = e.end);
	o(s, i.length, void 0);
}
//#endregion
//#region packages/core/src/semantics/UiSemanticsDiff.ts
function zm(e, t) {
	let n = [];
	for (let r of e.keys()) t.has(r) || n.push({
		op: "remove",
		id: r
	});
	for (let [r, i] of t) {
		let t = e.get(r);
		if (t === void 0) {
			n.push({
				op: "add",
				node: i
			});
			continue;
		}
		Bm(t, i) || n.push({
			op: "update",
			node: i
		});
	}
	return n;
}
function Bm(e, t) {
	let n = Object.keys(e), r = Object.keys(t);
	if (n.length !== r.length) return !1;
	for (let r of n) {
		let n = e[r], i = t[r];
		if (r === "states") {
			let e = n, t = i;
			if (t === void 0 || e.length !== t.length || e.some((e, n) => e !== t[n])) return !1;
			continue;
		}
		if (!Object.is(n, i)) return !1;
	}
	return !0;
}
//#endregion
//#region packages/framework/src/bounds.ts
var Vm = {
	x: 0,
	y: 0,
	width: 0,
	height: 0
}, Hm = class extends ze {
	modifier;
	constructor() {
		super(Vm), this.modifier = tn(this);
	}
	next(e) {
		let t = super.getValue();
		(t.x !== e.x || t.y !== e.y || t.width !== e.width || t.height !== e.height) && super.next(e);
	}
};
function Um(e) {
	let t = new Hm();
	return e !== void 0 && (t.label = e), t;
}
//#endregion
//#region packages/framework/src/metadata.ts
var Wm = /* @__PURE__ */ new WeakMap();
function Gm(e) {
	let t = Wm.get(e);
	return t === void 0 && (t = {
		tag: e.name,
		inputs: /* @__PURE__ */ new Set(),
		states: /* @__PURE__ */ new Set(),
		injects: /* @__PURE__ */ new Map(),
		channels: /* @__PURE__ */ new Map()
	}, Wm.set(e, t)), t;
}
//#endregion
//#region packages/framework/src/decorators.ts
function Km(e) {
	return (t) => {
		let n = Gm(t);
		n.tag = e;
	};
}
function qm(e) {
	return (t, n) => {
		let r = t.constructor;
		Gm(r).injects.set(n, e);
	};
}
//#endregion
//#region packages/framework/src/channel/ChannelToken.ts
function Jm(e) {
	return Object.keys(e.initial);
}
//#endregion
//#region packages/framework/src/channel/ChannelProtocol.ts
function Ym(e) {
	let t = e?.type;
	return t === "channel:sync" || t === "channel:command";
}
function Xm(e) {
	let t = e?.type;
	return t === "channel:patch" || t === "channel:error";
}
//#endregion
//#region packages/framework/src/channel/StorePatch.ts
function Zm(e, t, n) {
	let r = [];
	return Qm(e, [], t, n, r), r;
}
function Qm(e, t, n, r, i) {
	if (!He(n, r)) {
		if (Array.isArray(n) && Array.isArray(r)) {
			$m(e, t, n, r, i);
			return;
		}
		if (ch(n) && ch(r)) {
			for (let a of Object.keys(r)) Object.prototype.hasOwnProperty.call(n, a) ? Qm(e, [...t, a], n[a], r[a], i) : i.push({
				op: "set",
				projection: e,
				path: [...t, a],
				value: r[a]
			});
			for (let a of Object.keys(n)) Object.prototype.hasOwnProperty.call(r, a) || i.push({
				op: "delete",
				projection: e,
				path: [...t, a]
			});
			return;
		}
		i.push({
			op: "set",
			projection: e,
			path: t,
			value: r
		});
	}
}
function $m(e, t, n, r, i) {
	let a = 0;
	for (; a < n.length && a < r.length && He(n[a], r[a]);) a++;
	let o = n.length - 1, s = r.length - 1;
	for (; o >= a && s >= a && He(n[o], r[s]);) o--, s--;
	let c = o - a + 1, l = s - a + 1;
	if (c !== 0 || l !== 0) {
		if (c === l) {
			for (let o = 0; o < c; o++) {
				let s = a + o;
				Qm(e, [...t, s], n[s], r[s], i);
			}
			return;
		}
		i.push({
			op: "splice",
			projection: e,
			path: t,
			index: a,
			deleteCount: c,
			items: r.slice(a, s + 1)
		});
	}
}
function eh(e, t) {
	let n = e;
	for (let e of t) n = th(n, e);
	return n;
}
function th(e, t) {
	switch (t.op) {
		case "set": return nh(e, t.path, 0, t.value);
		case "delete": return t.path.length === 0 ? void 0 : rh(e, t.path, 0);
		case "splice": return ih(e, t.path, 0, (e) => {
			let n = Array.isArray(e) ? e : [];
			return n.slice(0, t.index).concat(t.items, n.slice(t.index + t.deleteCount));
		});
	}
}
function nh(e, t, n, r) {
	if (n === t.length) return r;
	let i = t[n], a = ah(e, i);
	return sh(a, i, nh(oh(e, i), t, n + 1, r)), a;
}
function rh(e, t, n) {
	let r = t[n], i = ah(e, r);
	return n === t.length - 1 ? (Array.isArray(i) ? i.splice(Number(r), 1) : delete i[String(r)], i) : (sh(i, r, rh(oh(e, r), t, n + 1)), i);
}
function ih(e, t, n, r) {
	if (n === t.length) return r(e);
	let i = t[n], a = ah(e, i);
	return sh(a, i, ih(oh(e, i), t, n + 1, r)), a;
}
function ah(e, t) {
	return Array.isArray(e) ? e.slice() : ch(e) ? { ...e } : typeof t == "number" ? [] : {};
}
function oh(e, t) {
	if (e != null) return e[t];
}
function sh(e, t, n) {
	e[t] = n;
}
function ch(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
//#endregion
//#region packages/framework/src/channel/plainData.ts
var lh = 100;
function uh(e, t = []) {
	if (t.length > lh) return fh(t);
	if (e === null) return null;
	let n = typeof e;
	if (n === "string" || n === "number" || n === "boolean" || n === "undefined") return null;
	if (n === "function" || n === "symbol" || n === "bigint") return fh(t);
	if (Array.isArray(e)) {
		for (let n = 0; n < e.length; n++) {
			let r = uh(e[n], [...t, n]);
			if (r !== null) return r;
		}
		return null;
	}
	let r = Object.getPrototypeOf(e);
	if (r !== Object.prototype && r !== null) return fh(t);
	for (let [n, r] of Object.entries(e)) {
		let e = uh(r, [...t, n]);
		if (e !== null) return e;
	}
	return null;
}
function dh(e, t, n) {
	let r = uh(n);
	if (r === null) return;
	let i = r === "" ? `'${t}'` : `'${t}'${r}`;
	throw Error(`Channel '${e}' published ${i}, which is not plain data. Only primitives, arrays and plain objects cross the barrier: a Date, Map, Set, class instance or function compares by reference, so it would report a change on every update and rebuild the subtree bound to it. Flatten it in the view model.`);
}
function fh(e) {
	return e.map((e) => typeof e == "number" ? `[${e}]` : `.${e}`).join("");
}
//#endregion
//#region packages/framework/src/channel/provide.ts
function ph(e, t, n) {
	return new mh(e, t, n);
}
var mh = class {
	token;
	source;
	port;
	subscriptions = new u();
	previous = /* @__PURE__ */ new Map();
	checked = /* @__PURE__ */ new Set();
	synced = !1;
	constructor(e, t, n) {
		this.token = e, this.source = t, this.port = n;
		for (let t of Jm(e)) this.previous.set(t, e.initial[t]);
		this.port.onmessage = (e) => this.receive(e.data);
	}
	receive(e) {
		if (Ym(e)) try {
			if (e.type === "channel:sync") {
				this.sync();
				return;
			}
			this.runCommand(e.command, e.payload, e.rest);
		} catch (e) {
			this.post({
				type: "channel:error",
				message: e instanceof Error ? e.message : String(e),
				stack: e instanceof Error ? e.stack : void 0
			});
		}
	}
	runCommand(e, t, n) {
		let r = this.source.commands?.[e];
		if (r === void 0) {
			let t = Object.keys(this.source.commands ?? {}).sort().join(", ");
			throw Error(`Channel '${this.token.name}' has no command '${e}'. Declared commands: ${t.length > 0 ? t : "(none)"}.`);
		}
		r(t, ...n ?? []);
	}
	sync() {
		if (this.synced) {
			this.resend();
			return;
		}
		this.synced = !0;
		for (let e of Jm(this.token)) {
			let t = this.source.view[e];
			if (t === void 0) {
				this.post({
					type: "channel:error",
					message: `Channel '${this.token.name}' declares view key '${e}' but nothing was provided for it.`
				});
				continue;
			}
			this.subscriptions.add(t.subscribe({
				next: (t) => this.publish(e, t),
				error: (t) => this.post({
					type: "channel:error",
					message: `Channel '${this.token.name}' view key '${e}' errored: ${t instanceof Error ? t.message : String(t)}`,
					stack: t instanceof Error ? t.stack : void 0
				})
			}));
		}
	}
	publish(e, t) {
		if (!this.checked.has(e)) {
			this.checked.add(e);
			try {
				dh(this.token.name, e, t);
			} catch (e) {
				this.post({
					type: "channel:error",
					message: e instanceof Error ? e.message : String(e),
					stack: e instanceof Error ? e.stack : void 0
				});
				return;
			}
		}
		let n = Zm(e, this.previous.get(e), t);
		this.previous.set(e, t), n.length > 0 && this.post({
			type: "channel:patch",
			patches: n
		});
	}
	resend() {
		let e = [];
		for (let [t, n] of this.previous) e.push({
			op: "set",
			projection: t,
			path: [],
			value: n
		});
		e.length > 0 && this.post({
			type: "channel:patch",
			patches: e
		});
	}
	post(e) {
		this.port.postMessage(e);
	}
	dispose() {
		this.subscriptions.unsubscribe(), this.port.onmessage = null;
	}
};
//#endregion
//#region packages/framework/src/app/NodeReport.ts
function hh(e, t) {
	let n = e.map((e) => e.name).reverse();
	if (n.length === 0) return t.label === void 0 || t.label === "" ? `${t.type} ${t.id}` : `${t.type} "${t.label}"`;
	let r = n.join(" > ");
	return t.label === void 0 || t.label === "" ? r : `${r} "${t.label}"`;
}
function gh(e, t) {
	let n = e.observable?.label, r = typeof n == "string" && n !== "", i = e.emittedAt();
	return {
		source: r ? n : `observable #${e.id}`,
		kind: r ? "cell" : "observable",
		value: _h(e.value()),
		emissions: e.emissionCount(),
		emittedAt: i === null ? null : t + i,
		connected: e.connected()
	};
}
function _h(e) {
	if (e === void 0) return "undefined";
	if (e === null) return "null";
	if (typeof e == "function") return `ƒ ${e.name === "" ? "(anonymous)" : e.name}`;
	if (typeof e == "symbol") return e.toString();
	if (typeof e == "string") return e;
	if (typeof e == "number" || typeof e == "boolean" || typeof e == "bigint") return String(e);
	if (e instanceof Set) return `Set { ${[...e].map(_h).join(", ")} }`;
	if (e instanceof Map) return `Map { ${[...e].map(([e, t]) => `${_h(e)}: ${_h(t)}`).join(", ")} }`;
	if (Array.isArray(e)) return `[${e.map(_h).join(", ")}]`;
	try {
		return JSON.stringify(e) ?? String(e);
	} catch {
		return String(e);
	}
}
//#endregion
//#region packages/framework/src/worker/WorkerPorts.ts
function vh(e) {
	let t;
	return {
		open(n) {
			t ??= e();
			let r = new MessageChannel();
			return t.postMessage({
				type: "gesso:port",
				key: n
			}, [r.port2]), r.port1;
		},
		get spawned() {
			return t !== void 0;
		},
		terminate() {
			t?.terminate(), t = void 0;
		}
	};
}
function yh(e) {
	let t = e;
	return t?.type === "port:error" && typeof t.message == "string";
}
//#endregion
//#region packages/framework/src/channel/ChannelReplica.ts
var bh = class {
	token;
	port;
	cells = /* @__PURE__ */ new Map();
	commandProxy;
	errorListener = null;
	pending = null;
	scheduleFlush = null;
	constructor(e, t) {
		this.token = e, this.port = t;
		for (let t of Jm(e)) {
			let n = new we(e.initial[t]);
			n.label = `${e.name}.${t}`, this.cells.set(t, n);
		}
		this.commandProxy = this.createCommandProxy(), this.port.onmessage = (e) => this.receive(e.data), this.post({ type: "channel:sync" });
	}
	get view() {
		return this.viewProxy;
	}
	get send() {
		return this.commandProxy;
	}
	viewProxy = new Proxy({}, { get: (e, t) => {
		if (typeof t != "string") return;
		let n = this.cells.get(t);
		if (n === void 0) {
			let e = [...this.cells.keys()].sort().join(", ");
			throw Error(`'${t}' is not a view key on channel '${this.token.name}'. Declared keys: ${e.length > 0 ? e : "(none)"}.`);
		}
		return n;
	} });
	createCommandProxy() {
		return new Proxy({}, { get: (e, t) => {
			if (typeof t == "string") return (...e) => {
				this.post(e.length > 1 ? {
					type: "channel:command",
					command: t,
					payload: e[0],
					rest: e.slice(1)
				} : {
					type: "channel:command",
					command: t,
					payload: e[0]
				});
			};
		} });
	}
	onError(e) {
		this.errorListener = e;
	}
	receive(e) {
		if (yh(e)) {
			this.report(e.message);
			return;
		}
		if (Xm(e)) {
			if (e.type === "channel:error") {
				this.report(e.message, e.stack);
				return;
			}
			if (this.pending === null) {
				this.applyPatches(e.patches);
				return;
			}
			this.pending.push(...e.patches), this.scheduleFlush?.();
		}
	}
	report(e, t) {
		(this.errorListener ?? ((e, t) => console.error(`[gesso channel ${this.token.name}] ${e}`, t)))(e, t);
	}
	deferPatches(e) {
		this.scheduleFlush = e, this.pending = [];
	}
	get hasPendingPatches() {
		return this.pending !== null && this.pending.length > 0;
	}
	flush() {
		if (this.pending === null || this.pending.length === 0) return;
		let e = this.pending;
		this.pending = [], this.applyPatches(e);
	}
	applyPatches(e) {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) {
			let e = t.get(n.projection);
			e === void 0 ? t.set(n.projection, [n]) : e.push(n);
		}
		for (let [e, n] of t) {
			let t = this.cells.get(e);
			t !== void 0 && t.next(eh(t.value, n));
		}
	}
	post(e) {
		this.port.postMessage(e);
	}
	dispose() {
		this.port.onmessage = null;
	}
}, xh = class {
	replicas = /* @__PURE__ */ new Map();
	attach(e, t) {
		if (this.replicas.has(e.name)) throw Error(`Channel '${e.name}' is already attached.`);
		let n = new bh(e, t);
		return this.replicas.set(e.name, n), n;
	}
	get(e) {
		let t = this.replicas.get(e.name);
		if (t === void 0) {
			let t = [...this.replicas.keys()].sort().join(", ");
			throw Error(`Channel '${e.name}' is not attached. Did you forget useChannel(...)? Attached channels: ${t.length > 0 ? t : "(none)"}.`);
		}
		return t;
	}
	has(e) {
		return this.replicas.has(e.name);
	}
	all() {
		return [...this.replicas.values()];
	}
	dispose() {
		for (let e of this.replicas.values()) e.dispose();
		this.replicas.clear();
	}
};
//#endregion
//#region packages/framework/src/channel/createChannelRegistry.ts
function Sh(e) {
	return typeof e == "object";
}
function Ch(e, t) {
	let n = new xh(), r = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Map(), a = [];
	for (let o of e) {
		let e = o.token, s;
		if (o.worker !== void 0) {
			let t;
			if (Sh(o.worker)) t = o.worker;
			else {
				let e = o.worker;
				t = i.get(e) ?? vh(e), i.set(e, t);
			}
			r.add(t), s = t.open(e.name);
		} else {
			if (o.source === void 0) throw Error(`Channel '${e.name}' was registered with neither a worker nor a source, and no application-logic worker was supplied to serve it. Pass appLogicWorker to createApp to spawn one, source to feed the channel from this thread, or worker to name a worker of its own.`);
			let t = new MessageChannel();
			a.push(ph(e, o.source, t.port2)), s = t.port1;
		}
		n.attach(e, s).onError((n, r) => {
			t === void 0 ? console.error(`[gesso channel ${e.name}] ${n}`, r) : t(e.name, n, r);
		});
	}
	return {
		registry: n,
		dispose: () => {
			for (let e of a) e.dispose();
			a.length = 0, n.dispose();
			for (let e of r) e.terminate();
			r.clear(), i.clear();
		}
	};
}
//#endregion
//#region packages/framework/src/createComponent.ts
function wh(e, ...t) {
	let [n, r] = t;
	return {
		kind: "component",
		tag: Gm(e).tag,
		component: e,
		props: n ?? {},
		key: r
	};
}
//#endregion
//#region packages/framework/src/FunctionComponent.ts
function Th(t) {
	return t.prototype instanceof e;
}
//#endregion
//#region packages/framework/src/overlay/OverlayService.ts
var Eh = class {
	entries = O([]);
	open(e) {
		let t = this.entries.value.filter((t) => t.id !== e.id);
		this.entries.value = [...t, e];
	}
	close(e) {
		let t = this.entries.value.find((t) => t.id === e);
		t !== void 0 && (this.entries.value = this.entries.value.filter((e) => e !== t), t.onClose?.());
	}
	closeAll() {
		let e = this.entries.value;
		if (e.length !== 0) {
			this.entries.value = [];
			for (let t of e) t.onClose?.();
		}
	}
	isOpen(e) {
		return this.entries.value.some((t) => t.id === e);
	}
};
//#endregion
//#region \0@oxc-project+runtime@0.143.0/helpers/esm/decorate.js
function Dh(e, t, n, r) {
	var i = arguments.length, a = i < 3 ? t : r === null ? r = Object.getOwnPropertyDescriptor(t, n) : r, o;
	if (typeof Reflect == "object" && typeof Reflect.decorate == "function") a = Reflect.decorate(e, t, n, r);
	else for (var s = e.length - 1; s >= 0; s--) (o = e[s]) && (a = (i < 3 ? o(a) : i > 3 ? o(t, n, a) : o(t, n)) || a);
	return i > 3 && a && Object.defineProperty(t, n, a), a;
}
//#endregion
//#region packages/framework/src/overlay/OverlayLayer.ts
var Oh = class extends e {
	overlays;
	render() {
		return rn({
			position: "absolute",
			inset: 0,
			zIndex: 1e3,
			hitTestable: !1
		}, this.overlays.entries.pipe(Ce((e) => this.renderEntries(e))));
	}
	renderEntries(e) {
		let t = [];
		for (let n of e) n.dismissOnOutsidePress && t.push(rn({
			key: `${n.id}\0backdrop`,
			position: "absolute",
			inset: 0,
			zIndex: n.zIndex,
			onPointerDown: () => this.overlays.close(n.id),
			onWheel: () => this.overlays.close(n.id)
		})), t.push(rn({
			key: n.id,
			position: "absolute",
			anchor: n.anchor ?? void 0,
			placement: n.placement,
			anchorOffset: n.offset,
			top: n.top,
			right: n.right,
			bottom: n.bottom,
			left: n.left,
			zIndex: n.zIndex,
			...kh(n),
			...Ah(n.environment ?? n.anchor ?? null)
		}, n.content));
		return t;
	}
};
Dh([qm(Eh)], Oh.prototype, "overlays", void 0), Oh = Dh([Km("gesso-overlay-layer")], Oh);
function kh(e) {
	if (e.center === void 0 || (e.anchor ?? null) !== null) return {};
	let t = e.center === "x" || e.center === "both", n = e.center === "y" || e.center === "both";
	return {
		hitTestable: !1,
		...t ? {
			left: e.left ?? 0,
			right: e.right ?? 0,
			x: "center"
		} : {},
		...n ? {
			top: e.top ?? 0,
			bottom: e.bottom ?? 0,
			y: "center"
		} : {}
	};
}
function Ah(e) {
	let t = e?.environment;
	return t == null ? {} : {
		theme: t.get(P.theme),
		textStyle: t.get(P.textStyle),
		contentColor: t.get(P.contentColor)
	};
}
//#endregion
//#region packages/framework/src/ComponentHost.ts
var jh = class {
	services;
	channels;
	instance;
	element;
	subscriptions = new u();
	mounted = !1;
	output;
	inputSources = /* @__PURE__ */ new Map();
	inputSubscriptions = /* @__PURE__ */ new Map();
	functionalCells = /* @__PURE__ */ new Map();
	mountHooks = [];
	unmountHooks = [];
	rendering = !1;
	constructor(e, t = new Be(), n = new xh()) {
		this.services = t, this.channels = n, this.element = e, Th(e.component) ? (this.instance = new e.component(), this.validateInputs(), this.wireInputs(), this.wireInjects(), this.wireChannels()) : this.instance = void 0;
	}
	get component() {
		return this.element.component;
	}
	render() {
		return this.output === void 0 && (this.output = this.instance === void 0 ? this.renderFunction() : this.instance.render()), this.output;
	}
	mount() {
		if (!this.mounted) {
			this.mounted = !0, this.instance?.onMount?.();
			for (let e of this.mountHooks) e();
		}
	}
	dispose() {
		if (this.mounted) {
			this.mounted = !1, this.instance?.onUnmount?.();
			for (let e of this.unmountHooks) e();
		}
		this.subscriptions.unsubscribe();
		for (let e of this.functionalCells.values()) e.complete();
	}
	updateProps(e) {
		if (this.element.props = e, this.instance !== void 0) {
			this.wireInputs();
			return;
		}
		for (let [t, n] of this.functionalCells) this.applyInput(t, n, e[t], !0);
	}
	renderFunction() {
		let e = this.element.component, t = this.createContext();
		this.rendering = !0;
		try {
			return Ae(this.element.tag, () => e(this.createInputRecord(), t));
		} finally {
			this.rendering = !1;
		}
	}
	createInputRecord() {
		let e = (e) => {
			let t = this.functionalCells.get(e);
			return t === void 0 && (t = new we(void 0), t.label = `${this.element.tag}.${e}`, this.functionalCells.set(e, t), this.applyInput(e, t, this.element.props[e], !0)), t;
		};
		return new Proxy({}, {
			get: (t, n) => typeof n == "string" ? e(n) : void 0,
			has: (e, t) => typeof t == "string",
			ownKeys: () => Array.from(/* @__PURE__ */ new Set([...Object.keys(this.element.props), ...this.functionalCells.keys()])),
			getOwnPropertyDescriptor: (t, n) => typeof n == "string" ? {
				value: e(n),
				enumerable: !0,
				configurable: !0,
				writable: !1
			} : void 0,
			set: (e, t) => {
				throw Error(`Component '${this.element.tag}' tried to assign inputs.${String(t)}. Inputs are cells written by the host; read inputs.${String(t)}.value or bind the cell.`);
			}
		});
	}
	createContext() {
		let e = (e) => {
			if (!this.rendering) throw Error(`Component '${this.element.tag}' called ctx.${e}() outside its function body. Register lifecycle hooks while the component function runs.`);
		};
		return {
			inject: (e) => this.services.get(e),
			channel: (e) => this.channels.get(e),
			onMount: (t) => {
				e("onMount"), this.mountHooks.push(t);
			},
			onUnmount: (t) => {
				e("onUnmount"), this.unmountHooks.push(t);
			},
			effect: (e, t) => {
				let n = e.subscribe((e) => t(e));
				return this.subscriptions.add(n), n;
			},
			bounds: (e) => {
				let t = Um(e ?? `${this.element.tag}.bounds`);
				return this.subscriptions.add(() => t.complete()), t;
			}
		};
	}
	wireInputs() {
		let e = Gm(this.element.component), t = this.element.props;
		for (let n of e.inputs) {
			let r = this.instance[n];
			r.label ??= `${e.tag}.${n}`, this.applyInput(n, r, t[n], !1);
		}
	}
	applyInput(e, t, n, r) {
		if (this.inputSources.has(e) && this.inputSources.get(e) === n) return;
		let i = this.inputSubscriptions.get(e);
		i !== void 0 && (i.unsubscribe(), this.subscriptions.remove(i), this.inputSubscriptions.delete(e));
		let a = this.inputSources.has(e) && this.inputSources.get(e) !== void 0;
		if (this.inputSources.set(e, n), n === void 0) {
			r && a && t.next(void 0);
			return;
		}
		if (Le(n)) {
			let e = Re(n);
			t.next((t) => e.next(t));
			return;
		}
		if (At(n)) {
			let r = n.subscribe((e) => t.next(e));
			this.inputSubscriptions.set(e, r), this.subscriptions.add(r);
			return;
		}
		t.next(n);
	}
	validateInputs() {
		let e = Gm(this.element.component);
		for (let t of e.inputs) if (!(this.instance[t] instanceof we)) throw Error(`Component '${e.tag}' declares @Input() '${t}' but it is not an input cell. Initialize it with input(defaultValue).`);
	}
	wireChannels() {
		let e = Gm(this.element.component);
		for (let [t, n] of e.channels) this.instance[t] = this.channels.get(n);
	}
	wireInjects() {
		let e = Gm(this.element.component);
		for (let [t, n] of e.injects) {
			let e = this.services.get(n);
			this.instance[t] = e;
		}
	}
}, Mh = class {
	services;
	channels;
	hosts = /* @__PURE__ */ new Map();
	pendingMounts = [];
	constructor(e = new Be(), t = new xh()) {
		this.services = e, this.channels = t;
	}
	resolve(e, t) {
		let n = this.hosts.get(t);
		return n !== void 0 && n.component !== e.component && (n.dispose(), this.hosts.delete(t), n = void 0), n === void 0 ? (n = new jh(e, this.services, this.channels), this.hosts.set(t, n), this.pendingMounts.push(n)) : n.updateProps(e.props), n.render();
	}
	release(e) {
		let t = this.hosts.get(e);
		t !== void 0 && (this.hosts.delete(e), this.pendingMounts = this.pendingMounts.filter((e) => e !== t), t.dispose());
	}
	flushMounts() {
		if (this.pendingMounts.length === 0) return;
		let e = this.pendingMounts;
		this.pendingMounts = [];
		for (let t of e) t.mount();
	}
	dispose() {
		let e = [...this.hosts.values()];
		this.hosts.clear(), this.pendingMounts = [];
		for (let t of e) t.dispose();
	}
	get size() {
		return this.hosts.size;
	}
	hostFor(e) {
		return this.hosts.get(e);
	}
};
//#endregion
//#region packages/framework/src/app/worker/RenderWorkerProtocol.ts
function Nh() {
	return typeof performance > "u" ? Date.now() : performance.timeOrigin + performance.now();
}
//#endregion
//#region packages/framework/src/app/AudioSink.ts
var Ph = 1e3, Fh = [
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
], Ih = class {
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
		this.element = n(), this.element.preload = "auto", this.spare = n(), this.spare.preload = "auto", this.session = t.mediaSession === void 0 ? typeof navigator < "u" && "mediaSession" in navigator ? navigator.mediaSession : null : t.mediaSession, this.sampleEveryMs = t.sampleEveryMs ?? Ph;
		for (let e of Fh) this.element.addEventListener(e, this.onEvent);
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
		for (let e of Fh) this.element.removeEventListener(e, this.onEvent);
		let e = this.element;
		this.element = this.spare, this.spare = e, this.prepared = "", this.spare.pause(), this.spare.src = "";
		for (let e of Fh) this.element.addEventListener(e, this.onEvent);
	}
	dispose() {
		this.stopTimer();
		for (let e of Fh) this.element.removeEventListener(e, this.onEvent);
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
			buffered: Lh(e),
			at: Nh(),
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
function Lh(e) {
	let t = e.buffered, n = e.currentTime;
	for (let e = 0; e < t.length; e++) if (t.start(e) <= n && n <= t.end(e)) return t.end(e);
	return n;
}
//#endregion
//#region packages/framework/src/app/EditingProxy.ts
var Rh = /* @__PURE__ */ new Set([
	"insertCompositionText",
	"insertFromComposition",
	"deleteCompositionText"
]), zh = /* @__PURE__ */ new Set([
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
]), Bh = class {
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
		t.removeAttribute("aria-hidden"), Uh(t, "role", e.role), Uh(t, "aria-label", e.label), Uh(t, "aria-description", e.description);
		let n = new Set(e.states ?? []);
		Uh(t, "aria-required", n.has("required") ? "true" : void 0), Uh(t, "aria-invalid", n.has("invalid") ? "true" : void 0), Uh(t, "aria-readonly", n.has("readonly") ? "true" : void 0), Uh(t, "aria-disabled", e.disabled === !0 ? "true" : void 0);
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
			Rh.has(n) || this.composing || (e.preventDefault(), !(zh.has(n) || n === "insertFromPaste") && this.sink.beforeInput(n, t.data ?? null));
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
function Vh(e, t = document) {
	let n = typeof navigator < "u" ? navigator.clipboard : void 0;
	if (n !== void 0 && typeof n.writeText == "function") {
		n.writeText(e).catch(() => Hh(e, t));
		return;
	}
	Hh(e, t);
}
function Hh(e, t) {
	let n = t.activeElement, r = t.createElement("textarea");
	r.value = e, r.style.position = "fixed", r.style.opacity = "0", t.body.appendChild(r), r.select();
	try {
		t.execCommand("copy");
	} finally {
		r.remove(), n?.focus?.({ preventScroll: !0 });
	}
}
function Uh(e, t, n) {
	n === void 0 ? e.removeAttribute(t) : e.setAttribute(t, n);
}
//#endregion
//#region packages/framework/src/app/SemanticsMirror.ts
var Wh = {
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
}, Gh = /* @__PURE__ */ new Set([
	"checkbox",
	"radio",
	"switch",
	"menuitemcheckbox",
	"menuitemradio"
]), Kh = [
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
], qh = /* @__PURE__ */ new Set(["heading", "paragraph"]), Jh = /* @__PURE__ */ new Set(["status", "alert"]), Yh = /* @__PURE__ */ new Set(["textbox", "searchbox"]), Xh = class {
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
		for (let t of Kh) e.removeAttribute(t);
		let n = t.label;
		t.role !== void 0 && e.setAttribute("role", t.role), n !== void 0 && t.role !== void 0 && !qh.has(t.role) ? (e.setAttribute("aria-label", n), Qh(e, Yh.has(t.role) ? t.valueText ?? "" : Jh.has(t.role) ? n : "")) : Qh(e, n ?? ""), t.description !== void 0 && e.setAttribute("aria-description", t.description), t.live !== void 0 && e.setAttribute("aria-live", t.live), t.disabled === !0 && e.setAttribute("aria-disabled", "true");
		for (let n of t.states ?? []) {
			let t = Wh[n];
			t !== void 0 && e.setAttribute(t[0], t[1]);
		}
		let r = (t.states ?? []).some((e) => e === "checked" || e === "mixed");
		t.role !== void 0 && Gh.has(t.role) && !r && e.setAttribute("aria-checked", "false"), Zh(e, "aria-valuenow", t.valueNow), Zh(e, "aria-valuemin", t.valueMin), Zh(e, "aria-valuemax", t.valueMax), Zh(e, "aria-posinset", t.posInSet), Zh(e, "aria-setsize", t.setSize), Zh(e, "aria-level", t.level), t.valueText !== void 0 && e.setAttribute("aria-valuetext", t.valueText);
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
function Zh(e, t, n) {
	n !== void 0 && e.setAttribute(t, String(n));
}
function Qh(e, t) {
	e.children.length > 0 || e.textContent !== t && (e.textContent = t);
}
//#endregion
//#region packages/framework/src/storage/StorageAdapter.ts
function $h(e) {
	let t = e instanceof Error ? e.name : "";
	return t === "QuotaExceededError" || t === "NS_ERROR_DOM_QUOTA_REACHED" ? "full" : t === "SecurityError" || t === "NotAllowedError" || t === "TypeError" ? "denied" : "failed";
}
function eg(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region packages/framework/src/app/shellStorage.ts
var tg = {
	outcome: "denied",
	value: null,
	keys: [],
	error: "This window has no localStorage."
};
function ng(e, t) {
	try {
		let n = t();
		if (n == null) return tg;
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
			outcome: $h(e),
			value: null,
			keys: [],
			error: eg(e)
		};
	}
}
function rg() {
	return tg;
}
//#endregion
//#region packages/framework/src/app/mediaQuery.ts
function ig(e, t) {
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
function ag(e) {
	return ig("(prefers-color-scheme: dark)", (t) => e(t ? "dark" : "light"));
}
//#endregion
//#region packages/framework/src/app/reducedMotion.ts
function og(e) {
	return ig("(prefers-reduced-motion: reduce)", e);
}
//#endregion
//#region packages/framework/src/app/shellHistory.ts
function sg(e = {}, t = typeof window > "u" ? void 0 : window) {
	let n = e.mode ?? (t === void 0 ? "memory" : "path");
	return n === "memory" || t === void 0 ? new cg(e.initialUrl ?? "/") : new lg(t, n, e.base ?? "");
}
var cg = class {
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
}, lg = class {
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
		return this.base.length === 0 ? e.length === 0 ? "/" : ug(e) : e === this.base || !e.startsWith(`${this.base}/`) ? "/" : ug(e.slice(this.base.length));
	}
};
function ug(e) {
	return e.startsWith("/") ? e : `/${e}`;
}
//#endregion
//#region packages/framework/src/app/fullscreen.ts
function dg(e, t) {
	let n = fg(e);
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
function fg(e) {
	let t = e.ownerDocument ?? null;
	if (t !== null && typeof t.addEventListener == "function") return t;
	let n = globalThis.document === void 0 ? null : globalThis.document;
	return n !== null && typeof n.addEventListener == "function" ? n : null;
}
function pg(e) {
	let t = fg(e);
	return t !== null && (t.fullscreenElement ?? t.webkitFullscreenElement ?? null) !== null;
}
function mg(e, t) {
	let n = fg(e);
	if (n === null) return () => {};
	let r = () => t(pg(e));
	return n.addEventListener("fullscreenchange", r), n.addEventListener("webkitfullscreenchange", r), () => {
		n.removeEventListener("fullscreenchange", r), n.removeEventListener("webkitfullscreenchange", r);
	};
}
function hg(e, t, n) {
	let r = (n ? e : t).getBoundingClientRect();
	return r.width > 0 && r.height > 0 ? {
		width: r.width,
		height: r.height
	} : null;
}
function gg(e) {
	if (typeof globalThis.requestAnimationFrame != "function") {
		e();
		return;
	}
	globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(e));
}
//#endregion
//#region packages/framework/src/app/worker/WorkerApp.ts
function _g(e, t) {
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
function vg(e) {
	if (typeof e != "string" || e === "") return;
	let t = e.replace(/\s+/g, " ");
	return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}
//#endregion
//#region packages/framework/src/app/ShellService.ts
var yg = class {
	handler = null;
	scheme = O("light");
	insets = O(br);
	isFullscreen = O(!1);
	popups = /* @__PURE__ */ new Map();
	nextPopupId = 1;
	stores = /* @__PURE__ */ new Map();
	nextStorageId = 1;
	colorScheme = this.scheme;
	get currentColorScheme() {
		return this.scheme.value;
	}
	viewportInsets = this.insets;
	get currentViewportInsets() {
		return this.insets.value;
	}
	setHandler(e) {
		this.handler = e;
	}
	applyColorScheme(e) {
		this.scheme.value !== e && (this.scheme.value = e);
	}
	applyViewportInsets(e) {
		xr(this.insets.value, e) || (this.insets.value = e);
	}
	copyText(e) {
		this.handler?.({
			type: "clipboard",
			text: e
		});
	}
	openUrl(e) {
		this.handler?.({
			type: "openUrl",
			url: e
		});
	}
	fullscreen = this.isFullscreen;
	requestFullscreen(e) {
		this.handler?.({
			type: "fullscreen",
			enter: e
		});
	}
	applyFullscreen(e) {
		this.isFullscreen.value !== e && (this.isFullscreen.value = e);
	}
	openPopup(e) {
		let t = this.handler;
		if (t == null) return Promise.resolve(!1);
		let n = this.nextPopupId++, r = new Promise((e) => {
			this.popups.set(n, e);
		});
		return t({
			type: "popup",
			id: n,
			url: e.url,
			name: e.name ?? "gesso-popup",
			width: e.width ?? 520,
			height: e.height ?? 680
		}), r;
	}
	settlePopup(e, t) {
		let n = this.popups.get(e);
		n !== void 0 && (this.popups.delete(e), n(t));
	}
	requestStorage(e) {
		let t = this.handler;
		if (t == null) return Promise.resolve({
			outcome: "denied",
			value: null,
			keys: [],
			error: "There is no shell to store through."
		});
		let n = this.nextStorageId++, r = new Promise((e) => {
			this.stores.set(n, e);
		});
		return t({
			type: "storage",
			id: n,
			op: e.op,
			key: e.key,
			...e.value === void 0 ? {} : { value: e.value }
		}), r;
	}
	settleStorage(e, t) {
		let n = this.stores.get(e);
		n !== void 0 && (this.stores.delete(e), n(t));
	}
}, bg = {
	status: "idle",
	position: 0,
	duration: NaN,
	buffered: 0,
	at: 0
}, xg = 100, Sg = 86400, Cg = class {
	handler = null;
	animations = null;
	sample = O(bg);
	source = O(null);
	position = O(0);
	actionSubject = new ve();
	state = qe(() => this.current, { label: "AudioService.state" });
	actions = this.actionSubject.asObservable();
	get current() {
		let e = this.sample.value;
		return {
			status: e.status,
			position: this.position.value,
			duration: e.duration,
			buffered: e.buffered,
			src: this.source.value,
			...e.error === void 0 ? {} : { error: e.error }
		};
	}
	setHandler(e) {
		this.handler = e;
	}
	setAnimations(e) {
		this.animations = e;
	}
	applySample(e) {
		this.sample.value = e;
		let t = e.status === "playing" ? Math.max(0, (Nh() - e.at) / 1e3) : 0, n = Number.isFinite(e.duration), r = n ? Math.min(e.position + t, e.duration) : e.position + t;
		if (this.animations?.stop(this.position), this.position.value = r, e.status !== "playing" || this.animations === null) return;
		let i = n ? e.duration : r + Sg;
		i <= r || this.animations.animate(this.position, i, {
			duration: (i - r) * 1e3,
			easing: tt,
			stepMs: xg,
			reducedMotion: "keep"
		});
	}
	applyAction(e) {
		this.actionSubject.next(e);
	}
	load(e, t = {}) {
		this.animations?.stop(this.position), this.source.value = e, this.position.value = 0, this.sample.value = {
			status: "loading",
			position: 0,
			duration: NaN,
			buffered: 0,
			at: Nh()
		}, this.handler?.({
			type: "load",
			src: e,
			autoplay: t.autoplay ?? !0
		});
	}
	preload(e) {
		this.handler?.({
			type: "preload",
			src: e
		});
	}
	play() {
		this.handler?.({ type: "play" });
	}
	pause() {
		this.handler?.({ type: "pause" });
	}
	seek(e) {
		this.animations?.stop(this.position), this.position.value = Math.max(0, e), this.handler?.({
			type: "seek",
			seconds: Math.max(0, e)
		});
	}
	setVolume(e) {
		this.handler?.({
			type: "volume",
			level: Math.min(1, Math.max(0, e))
		});
	}
	setMetadata(e) {
		this.handler?.({
			type: "metadata",
			metadata: e
		});
	}
}, wg = class {
	byRoute = /* @__PURE__ */ new Map();
	cell(e, t, n) {
		let r = this.byRoute.get(e);
		r === void 0 && (r = /* @__PURE__ */ new Map(), this.byRoute.set(e, r));
		let i = r.get(t);
		if (i !== void 0) return i;
		let a = O(n, `${e === null ? "router" : e.path}.${t}`);
		return r.set(t, a), a;
	}
	has(e, t) {
		return this.byRoute.get(e)?.has(t) ?? !1;
	}
	forget(e) {
		this.byRoute.delete(e);
	}
	clear() {
		this.byRoute.clear();
	}
};
//#endregion
//#region packages/framework/src/router/RoutePath.ts
function Tg(e) {
	return e.split("/").filter((e) => e.length > 0);
}
function Eg(e) {
	return Tg(e).map((t, n, r) => {
		if (t === "*") {
			if (n !== r.length - 1) throw Error(`Route pattern '${e}' has '*' before its last segment; a rest may only end a pattern.`);
			return { kind: "rest" };
		}
		if (t.startsWith(":")) {
			let n = t.slice(1);
			if (n.length === 0) throw Error(`Route pattern '${e}' has an unnamed ':' segment.`);
			return {
				kind: "param",
				name: n
			};
		}
		return {
			kind: "static",
			text: t
		};
	});
}
function Dg(e, t) {
	let n = {};
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		if (i.kind === "rest") return n.rest = t.slice(r).join("/"), n;
		let a = t[r];
		if (a === void 0) return null;
		if (i.kind === "static") {
			if (i.text !== a) return null;
			continue;
		}
		n[i.name] = decodeURIComponent(a);
	}
	return t.length === e.length ? n : null;
}
function Og(e, t = {}) {
	return `/${Eg(e).map((n) => {
		if (n.kind === "static") return n.text;
		if (n.kind === "rest") return t.rest ?? "";
		let r = t[n.name];
		if (r === void 0) throw Error(`Route '${e}' needs a '${n.name}' param.`);
		return encodeURIComponent(r);
	}).filter((e) => e.length > 0).join("/")}`;
}
function kg(e) {
	let [t = "", n = ""] = jg(e.split("#")[0] ?? "", "?"), r = {};
	for (let e of n.split("&")) {
		if (e.length === 0) continue;
		let [t = "", n = ""] = jg(e, "=");
		r[decodeURIComponent(t)] = decodeURIComponent(n.replace(/\+/g, " "));
	}
	return {
		path: `/${Tg(t).join("/")}`,
		query: r
	};
}
function Ag(e, t = {}) {
	let n = Object.entries(t).map(([e, t]) => `${encodeURIComponent(e)}=${encodeURIComponent(t)}`), r = `/${Tg(e).join("/")}`;
	return n.length === 0 ? r : `${r}?${n.join("&")}`;
}
function jg(e, t) {
	let n = e.indexOf(t);
	return n === -1 ? [e, ""] : [e.slice(0, n), e.slice(n + t.length)];
}
//#endregion
//#region packages/framework/src/router/RouterService.ts
var Mg = 10, Ng = class {
	url = O("/");
	match = O(null);
	state = new wg();
	routes = [];
	notFound;
	history = null;
	setHistory(e) {
		this.history = e;
	}
	setRoutes(e) {
		this.routes = e.routes, this.notFound = e.notFound, this.resolveInto(this.url.value, { push: !1 });
	}
	get declaredRoutes() {
		return this.routes;
	}
	go(e, ...t) {
		let [n, r] = Pg(t), i = Og(e.path, n);
		this.navigate(Ag(i, r.query), { replace: r.replace ?? !1 });
	}
	navigate(e, t = {}) {
		this.resolveInto(e, {
			push: !0,
			replace: t.replace ?? !1
		});
	}
	back() {
		this.history?.back();
	}
	forward() {
		this.history?.forward();
	}
	applyUrl(e) {
		this.resolveInto(e, { push: !1 });
	}
	params(e) {
		let t = this.match.value;
		return t === null || !t.chain.includes(e) ? null : t.params;
	}
	observeParams(e) {
		return qe(() => this.params(e), {
			equal: Rg,
			label: "RouterService.params"
		});
	}
	remember(e, t, n) {
		return this.state.cell(e, t, n);
	}
	forget(e) {
		this.state.forget(e);
	}
	answerFor(e, t, n) {
		let r = null;
		return qe((i) => {
			let a = this.params(e);
			if (a === null) return r;
			let o = i(t);
			return r = o == null ? null : n.answers(o) === n.asks(a) ? o : null, r;
		}, { label: `RouterService.answerFor(${e.path})` });
	}
	isActive(e) {
		return qe(() => {
			let t = this.match.value;
			return t !== null && t.chain.includes(e);
		});
	}
	resolveInto(e, t) {
		let n = t.push, r = t.replace ?? !1, i = e;
		for (let e = 0; e <= Mg; e++) {
			let e = this.resolve(i), t = e === null || this.runGuards(e);
			if (t === !1) {
				n || this.history?.replace(this.url.value);
				return;
			}
			if (t === !0) {
				this.publish(i, e, {
					push: n,
					replace: r
				});
				return;
			}
			i = Ig(t), r = !n || r;
		}
		throw Error(`Navigating to '${e}' redirected more than ${Mg} times.`);
	}
	publish(e, t, n) {
		let r = t?.url ?? Lg(e);
		n.replace === !0 ? this.history?.replace(r) : n.push && this.history?.push(r), this.url.value = r, this.match.value = t;
	}
	resolve(e) {
		let { path: t, query: n } = kg(e), r = Tg(t);
		for (let e of this.routes) {
			let i = Dg(e.segments, r);
			if (i !== null) return {
				route: e,
				chain: e.chain,
				params: i,
				query: n,
				path: t,
				url: Ag(t, n)
			};
		}
		return this.notFound === void 0 ? null : {
			route: this.notFound,
			chain: this.notFound.chain,
			params: {},
			query: n,
			path: t,
			url: Ag(t, n)
		};
	}
	runGuards(e) {
		for (let t of e.chain) {
			if (t.guard === void 0) continue;
			let n = t.guard({
				params: e.params,
				query: e.query,
				url: e.url
			});
			if (n !== !0) return n;
		}
		return !0;
	}
};
function Pg(e) {
	let t = e[0];
	return t === void 0 ? [{}, {}] : Fg(t) ? [{}, t] : [t, e[1] ?? {}];
}
function Fg(e) {
	return typeof e != "object" || !e ? !1 : Object.keys(e).every((e) => e === "query" || e === "replace");
}
function Ig(e) {
	return Ag(Og(e.route.path, e.params), e.query);
}
function Lg(e) {
	let { path: t, query: n } = kg(e);
	return Ag(t, n);
}
function Rg(e, t) {
	if (e === null || t === null) return e === t;
	let n = e, r = t, i = Object.keys(n);
	return i.length === Object.keys(r).length && i.every((e) => n[e] === r[e]);
}
//#endregion
//#region packages/framework/src/app/FindService.ts
var zg = class {
	open = O(!1);
	query = O("");
	matchCount = O(0);
	activeMatch = O(0);
	controller = null;
	detach = null;
	field = null;
	setController(e) {
		this.detach?.(), this.detach = null, this.controller = e, e !== null && (this.detach = e.onChange(() => this.sync(e)), e.setField(this.field), this.sync(e));
	}
	setField(e) {
		this.field = e, this.controller?.setField(e);
	}
	openFind() {
		this.controller?.open();
	}
	close() {
		this.controller?.close();
	}
	search(e, t = !1) {
		this.controller?.search(e, { matchCase: t });
	}
	next() {
		this.controller?.next();
	}
	previous() {
		this.controller?.previous();
	}
	refresh() {
		this.controller?.refresh();
	}
	sync(e) {
		this.open.value = e.isOpen, this.query.value = e.query, this.matchCount.value = e.matchCount, this.activeMatch.value = e.activeIndex + 1;
	}
}, Bg = class {
	focused = O(null);
	trapped = O(!1);
	manager = null;
	detach = null;
	queued = [];
	setManager(e) {
		if (this.detach?.(), this.detach = null, this.manager = e, e === null) {
			this.queued = [];
			return;
		}
		let t = e.onFocusChange((e) => {
			this.focused.value = e;
		}), n = e.onScopeChange(() => {
			this.trapped.value = e.trapped;
		});
		this.detach = () => {
			t(), n();
		};
		let r = this.queued;
		this.queued = [];
		for (let t of r) t(e);
		this.sync(e);
	}
	focus(e) {
		this.run((t) => t.focus(e));
	}
	blur() {
		this.run((e) => e.blur());
	}
	focusNext() {
		this.run((e) => e.focusNext());
	}
	focusPrevious() {
		this.run((e) => e.focusPrevious());
	}
	trap(e) {
		this.run((t) => t.pushScope(e));
	}
	releaseTrap() {
		this.run((e) => e.popScope());
	}
	run(e) {
		let t = this.manager;
		if (t === null) {
			this.queued.push(e);
			return;
		}
		e(t), this.sync(t);
	}
	sync(e) {
		this.focused.value = e.focusedNode, this.trapped.value = e.trapped;
	}
}, Vg = class {
	imageResolver = new Dd();
	iconRasterizer = new Nd();
	videoResolver = null;
	ownsResolver = !0;
	ownsRasterizer = !0;
	ownsVideoResolver = !0;
	get images() {
		return this.imageResolver;
	}
	get icons() {
		return this.iconRasterizer;
	}
	get videos() {
		return this.videoResolver === null && (this.videoResolver = new Qp(), this.ownsVideoResolver = !0), this.videoResolver;
	}
	setResolver(e) {
		this.ownsResolver && this.imageResolver.dispose(), this.imageResolver = e, this.ownsResolver = !1;
	}
	setVideoResolver(e) {
		this.ownsVideoResolver && this.videoResolver?.dispose(), this.videoResolver = e, this.ownsVideoResolver = !1;
	}
	setRasterizer(e) {
		this.ownsRasterizer && this.iconRasterizer.dispose(), this.iconRasterizer = e, this.ownsRasterizer = !1;
	}
	dispose() {
		this.ownsResolver && this.imageResolver.dispose(), this.ownsVideoResolver && this.videoResolver?.dispose(), this.ownsRasterizer && this.iconRasterizer.dispose();
	}
}, Hg = class {
	statuses = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	failed = /* @__PURE__ */ new Set();
	batches = [];
	listener = null;
	disposed = !1;
	declare(e, t = Kg()) {
		let n = [];
		for (let r of e) {
			if (_s(r.family, r.fallback ?? ["sans-serif"]), t.fonts === void 0) {
				this.statuses.set(r.family, "unavailable");
				continue;
			}
			this.statuses.set(r.family, "loading"), this.pending.set(r.family, (this.pending.get(r.family) ?? 0) + r.faces.length), r.faces.length === 0 && this.settle(r.family);
			for (let e of r.faces) n.push(this.loadFace(r.family, e, t));
		}
		this.batches.push(Promise.all(n).then(() => void 0));
	}
	get ready() {
		return Promise.all(this.batches).then(() => void 0);
	}
	statusOf(e) {
		return this.statuses.get(e) ?? "undeclared";
	}
	get families() {
		return [...this.statuses.keys()];
	}
	setListener(e) {
		this.listener = e;
	}
	dispose() {
		this.disposed = !0, this.listener = null;
	}
	async loadFace(e, t, n) {
		try {
			let r = Wg(e, t, n);
			n.fonts.add(r), await r.load(), ys(e);
		} catch {
			this.failed.add(e);
		}
		this.settle(e);
	}
	settle(e) {
		let t = (this.pending.get(e) ?? 1) - 1;
		this.pending.set(e, t), t <= 0 && this.statuses.set(e, this.failed.has(e) ? "error" : "loaded"), this.disposed || this.listener?.(e);
	}
}, Ug = /* @__PURE__ */ new Map();
function Wg(e, t, n) {
	let r = Gg(t);
	if (typeof t.source != "string") return n.createFace(e, t.source, r);
	let i = `${e}\0${t.source}\0${JSON.stringify(r)}`, a = Ug.get(i);
	return a === void 0 && (a = n.createFace(e, `url(${JSON.stringify(t.source)})`, r), Ug.set(i, a)), a;
}
function Gg(e) {
	let t = {};
	return e.weight !== void 0 && (t.weight = String(e.weight)), e.style !== void 0 && (t.style = e.style), e.stretch !== void 0 && (t.stretch = e.stretch), e.unicodeRange !== void 0 && (t.unicodeRange = e.unicodeRange), e.display !== void 0 && (t.display = e.display), t;
}
function Kg() {
	let e = globalThis, t = e.fonts ?? e.document?.fonts;
	return {
		fonts: t !== void 0 && typeof e.FontFace == "function" ? t : void 0,
		createFace: (t, n, r) => new e.FontFace(t, n, r)
	};
}
//#endregion
//#region packages/framework/src/app/AnimationService.ts
var qg = class {
	reducedMotion = O(!1);
	driver = null;
	motionVocabulary = yt;
	setDriver(e) {
		this.driver = e, e !== null && e.setReducedMotion(this.reducedMotion.value);
	}
	setMotion(e) {
		this.motionVocabulary = e;
	}
	get motion() {
		return this.motionVocabulary;
	}
	applyReducedMotion(e) {
		this.reducedMotion.value !== e && (this.reducedMotion.value = e, this.driver?.setReducedMotion(e));
	}
	animate(e, t, n = {}) {
		let r = vt(e, t, {
			duration: this.resolveDuration(n.duration ?? "normal"),
			easing: this.resolveEasing(n.easing ?? "standard"),
			stepMs: n.stepMs,
			repeat: n.repeat,
			reducedMotion: n.reducedMotion,
			delay: n.delay
		});
		if (r === void 0) return e.value = t, xe;
		let i = this.driver;
		return i === null ? (r.snap(), r.values) : i.start(r);
	}
	spring(e, t, n = {}) {
		let r = typeof n.spring == "string" || n.spring === void 0 ? this.motionVocabulary.springs[n.spring ?? "snappy"] : n.spring, i = this.driver, a = i?.animationFor(e), o = new gt(e, t, {
			spring: {
				stiffness: n.stiffness ?? r.stiffness,
				damping: n.damping ?? r.damping,
				mass: n.mass ?? r.mass
			},
			velocity: n.velocity ?? (a instanceof gt ? a.currentVelocity : 0),
			restDelta: n.restDelta,
			reducedMotion: n.reducedMotion,
			delay: n.delay
		});
		return i === null ? (o.snap(), o.values) : i.start(o);
	}
	stop(e) {
		return this.driver?.stop(e) ?? !1;
	}
	animationFor(e) {
		return this.driver?.animationFor(e);
	}
	resolveDuration(e) {
		return typeof e == "number" ? e : this.motionVocabulary.durations[e];
	}
	resolveEasing(e) {
		return typeof e == "function" ? e : this.motionVocabulary.easings[e] ?? rt.standard;
	}
}, Jg = class {
	subject = new ve();
	frames = this.subject.asObservable();
	publish(e) {
		this.subject.next(e);
	}
}, Yg = class {
	pendingAt = null;
	mark(e, t) {
		e === void 0 || !t || (this.pendingAt = this.pendingAt === null ? e : Math.min(this.pendingAt, e));
	}
	take(e) {
		let t = this.pendingAt;
		if (t === null) return null;
		this.pendingAt = null;
		let n = e - t;
		return n >= 0 ? n : null;
	}
	get hasPending() {
		return this.pendingAt !== null;
	}
	reset() {
		this.pendingAt = null;
	}
}, Xg = {
	stiffness: 900,
	damping: 60,
	mass: 1
}, Zg = class {
	graph;
	animations;
	limitOf;
	cells = /* @__PURE__ */ new Map();
	constructor(e, t, n) {
		this.graph = e, this.animations = t, this.limitOf = n;
	}
	scrollBy(e, t, n, r) {
		let i = this.cellFor(e, t).cell, a = this.destinationOf(i), o = this.limitOf(e, t), s = Qg((a ?? r) + n, 0, o);
		(a === void 0 || s !== a) && this.animations.spring(i, s, { spring: Xg });
	}
	adjust(e, t, n) {
		let r = this.cells.get(e)?.[t];
		if (r === void 0 || n === 0) return;
		let i = this.destinationOf(r.cell);
		i !== void 0 && (r.lastWritten = r.cell.value, this.animations.spring(r.cell, i + n, { spring: Xg }));
	}
	isScrolling(e) {
		let t = this.cells.get(e);
		return t === void 0 ? !1 : t.scrollX !== void 0 && this.destinationOf(t.scrollX.cell) !== void 0 || t.scrollY !== void 0 && this.destinationOf(t.scrollY.cell) !== void 0;
	}
	stop(e) {
		let t = this.cells.get(e);
		if (t !== void 0) for (let e of [t.scrollX, t.scrollY]) e !== void 0 && (this.animations.stop(e.cell), e.lastWritten = void 0);
	}
	handleNodeRemoved(e) {
		let t = [];
		for (let n of this.cells.keys()) (n === e || $g(n, e)) && t.push(n);
		for (let e of t) this.stop(e), this.cells.delete(e);
	}
	cellFor(e, t) {
		let n = this.cells.get(e);
		n === void 0 && (n = {}, this.cells.set(e, n));
		let r = n[t];
		if (r !== void 0) return r;
		let i = this.graph, a = this.animations, o = {
			cell: void 0,
			lastWritten: void 0
		}, s = {
			get value() {
				return e.getProperty(t) ?? 0;
			},
			set value(n) {
				let r = e.getProperty(t) ?? 0;
				if (o.lastWritten !== void 0 && r !== o.lastWritten) {
					o.lastWritten = void 0, a.stop(s);
					return;
				}
				o.lastWritten = n, e.setProperty(t, n), i.markDirty(e, k.Transform);
			}
		};
		return o.cell = s, n[t] = o, o;
	}
	destinationOf(e) {
		let t = this.animations.animationFor(e);
		return t instanceof gt ? t.destination : void 0;
	}
};
function Qg(e, t, n) {
	return Math.min(n, Math.max(t, e));
}
function $g(e, t) {
	for (let n = e.parent; n !== null; n = n.parent) if (n === t) return !0;
	return !1;
}
//#endregion
//#region packages/framework/src/app/GessoRuntime.ts
var e_ = 32, t_ = class {
	services;
	channels;
	input;
	inspector;
	resolver;
	graph = new Di();
	engine;
	builder;
	scheduler;
	inputLatency = new Yg();
	canvas;
	textMeasurer;
	canvasSurface = null;
	renderer;
	rendererState;
	rendererReady;
	dispatcher = new Mc();
	width;
	height;
	root;
	appRoot;
	viewportInsetValue = br;
	viewportInsetRegistry = null;
	viewportInsetWrite = null;
	detachViewportInsetEnvironment = null;
	constraints;
	pixelRatio;
	lastFrameMs = 0;
	frameListener = null;
	rendererErrorListener = null;
	gpuTimings = null;
	inspectListener = null;
	lastInspection = null;
	devtoolsListener = null;
	watchingTree = !1;
	lastSubscriptions = -1;
	watchingFrames = !1;
	selectedId = null;
	lastSelectedReport = null;
	cursorListener = null;
	lastCursor = null;
	scrollabilityListener = null;
	lastScrollability = {
		up: !1,
		down: !1,
		left: !1,
		right: !1
	};
	lastScrollsAnything = void 0;
	editingListener = null;
	selectionController = null;
	findController = null;
	focusManager;
	hitTester;
	layoutNotifier;
	smoothScroller;
	visible = !0;
	animations = new Ct();
	sharedElements = new wt();
	focusNotifier = new Uc();
	environmentNotifier = new Gs();
	semantics = /* @__PURE__ */ new Map();
	semanticsListener = null;
	semanticsBoxes = /* @__PURE__ */ new Map();
	lastFocusedId = null;
	focusAfterReload = null;
	restoringFocus = !1;
	semanticsStale = !1;
	lastEditingState = null;
	shellListener = null;
	audioListener = null;
	caretTimer = null;
	scrollbarTimer = null;
	inspectorTimer = null;
	animationTimer = null;
	replicas = [];
	phaseTimings = c_();
	started = !1;
	laidOutOnce = !1;
	constructor(e) {
		this.services = e.services ?? new Be(), this.channels = e.channels ?? new xh(), this.canvas = e.canvas, this.pixelRatio = e.dpr ?? 1, this.width = e.width ?? 600, this.height = e.height ?? 600, this.constraints = Y.loose(this.width, this.height);
		let t = e.renderer ?? "canvas2d";
		if (!(t === "webgpu" || t === "auto" && Id())) this.canvasSurface = ad(e.canvas), this.textMeasurer = e.textMeasurer ?? new sd(this.canvasSurface.getContext2D()), this.renderer = new td({ surface: this.canvasSurface }), this.rendererState = "canvas2d", this.rendererReady = Promise.resolve("canvas2d");
		else {
			let n = ad(e.measureCanvas ?? o_());
			this.textMeasurer = e.textMeasurer ?? new sd(n.getContext2D());
			let r = new bp({
				surface: bf(e.canvas),
				onError: (e) => this.reportRendererError(e),
				hooks: {
					onPrepareEnd: (e) => this.gpuTimings = {
						...this.gpuTimings ?? s_(),
						prepare: e
					},
					onUploadEnd: (e) => this.gpuTimings = {
						...this.gpuTimings ?? s_(),
						upload: e
					},
					onEncodeEnd: (e) => this.gpuTimings = {
						...this.gpuTimings ?? s_(),
						encode: e
					}
				}
			});
			this.renderer = r, this.rendererState = "pending", this.rendererReady = r.initialize().then(() => this.renderer === r ? (this.rendererState = "webgpu", this.renderer.resize(this.width, this.height, this.pixelRatio), this.requestRepaint(), "webgpu") : this.rendererState === "pending" ? "canvas2d" : this.rendererState).catch((e) => (t === "webgpu" && console.error("WebGPU was requested but is unavailable; drawing with Canvas2D.", e), this.fallBackToCanvas2D(r), "canvas2d"));
		}
		this.engine = new bu(this.textMeasurer), this.inspector = new Td(this.engine, { modifierNames: (e) => this.builder.modifiersFor(e)?.names ?? [] }), this.resolver = new Mh(this.services, this.channels), this.layoutNotifier = new xu(), this.focusManager = new Hc(this.graph.root, this.dispatcher), this.focusManager.onFocusChange((e) => {
			this.focusNotifier.handleFocusChange(e, this.focusManager.focusVisible), this.semanticsListener !== null && this.requestRepaint();
		}), this.graph.setEnvironmentChangedListener((e) => this.environmentNotifier.handleEnvironmentChange(e)), this.builder = new sa(this.graph, {
			components: this.resolver,
			dispatcher: this.dispatcher,
			focus: {
				isFocused: (e) => this.focusNotifier.isFocused(e),
				isFocusVisible: (e) => this.focusNotifier.isFocusVisible(e),
				focus: (e) => {
					this.focusManager.focus(e);
				},
				onFocusChange: (e, t) => this.focusNotifier.add(e, t)
			},
			environment: {
				read: (e, t) => (e.environment ?? this.graph.buildNodeEnvironment(e)).get(t),
				onChange: (e, t) => this.environmentNotifier.add(e, t)
			},
			layout: {
				box: (e) => this.engine.recordFor(e) === void 0 ? null : this.engine.visibleBox(e),
				flowBox: (e) => this.engine.recordFor(e) === void 0 ? null : this.engine.worldBox(e),
				scroll: (e) => {
					let t = this.engine.recordFor(e);
					return t === void 0 ? null : {
						x: t.scrollX,
						y: t.scrollY
					};
				},
				viewport: () => ({
					x: 0,
					y: 0,
					width: this.width,
					height: this.height
				}),
				onLayout: (e, t) => this.layoutNotifier.add(e, t)
			},
			animations: this.animations,
			sharedElements: this.sharedElements
		}), this.services.has(Eh) || this.services.register(Eh), this.services.has(yg) || this.services.register(yg), this.services.get(yg).setHandler((e) => this.shellListener?.(e)), this.services.has(Cg) || this.services.register(Cg), this.services.get(Cg).setHandler((e) => this.audioListener?.(e)), this.services.has(zg) || this.services.register(zg), this.services.has(Bg) || this.services.register(Bg), this.services.has(Jg) || this.services.register(Jg), this.services.has(Vg) || this.services.register(Vg), this.services.has(Hg) || this.services.register(Hg), this.services.get(Hg).setListener(() => this.fontsChanged()), e.fonts !== void 0 && this.services.get(Hg).declare(e.fonts), this.services.has(qg) || this.services.register(qg), this.services.get(qg).setDriver(this.animations), this.services.get(Cg).setAnimations(this.services.get(qg)), this.smoothScroller = new Zg(this.graph, this.services.get(qg), (e, t) => {
			let n = this.engine.recordFor(e);
			return n === void 0 ? 0 : t === "scrollY" ? Math.max(0, n.contentHeight - n.height) : Math.max(0, n.contentWidth - n.width);
		}), this.services.has(Ng) || this.services.register(Ng);
		let n = this.services.get(Ng);
		n.setHistory({
			push: (e) => this.shellListener?.({
				type: "history",
				action: "push",
				url: e
			}),
			replace: (e) => this.shellListener?.({
				type: "history",
				action: "replace",
				url: e
			}),
			back: () => this.shellListener?.({
				type: "history",
				action: "back"
			}),
			forward: () => this.shellListener?.({
				type: "history",
				action: "forward"
			})
		}), e.routes !== void 0 && n.setRoutes(e.routes), e.media?.resolver !== void 0 && this.services.get(Vg).setResolver(e.media.resolver), e.media?.rasterizer !== void 0 && this.services.get(Vg).setRasterizer(e.media.rasterizer), e.media?.videoResolver !== void 0 && this.services.get(Vg).setVideoResolver(e.media.videoResolver), this.scheduler = new hm({
			clock: e.clock ?? ((e) => new _m(e)),
			dirty: this.graph.getDirtyNodes(),
			beforeCollect: (e) => this.runPreCollectPhases(e),
			onFrame: (e) => this.handleFrame(e)
		}), this.animations.setWakeListener(() => this.scheduler.wake()), this.graph.setDirtyListener(() => this.scheduler.notifyDirty()), this.graph.setNodeRemovedListener((e) => {
			this.engine.detachNode(e), this.selectionController?.handleNodeRemoved(e), this.findController?.handleNodeRemoved(e), this.focusManager.handleNodeRemoved(e), this.layoutNotifier.handleNodeRemoved(e), this.smoothScroller.handleNodeRemoved(e), this.focusNotifier.handleNodeRemoved(e), this.environmentNotifier.handleNodeRemoved(e);
		}), this.buildRoot(e.root), this.input = this.createInput(), this.services.get(Bg).setManager(this.input.focus), this.input.focus.onFocusChange((e, t) => {
			e !== null && t !== "pointer" && this.scrollIntoView(e);
		}), e.width !== void 0 && e.height !== void 0 && this.resize(e.width, e.height, this.pixelRatio);
	}
	deferPatchesFrom(e) {
		this.replicas = e;
		for (let t of e) t.deferPatches(() => this.scheduler.notifyDirty());
	}
	start() {
		this.started = !0, this.scheduler.start();
	}
	get rendererBackend() {
		return this.rendererState;
	}
	onRendererError(e) {
		this.rendererErrorListener = e;
	}
	onListenerError(e) {
		this.dispatcher.onListenerError(e === null ? null : (t, n, r) => {
			e(`${t instanceof Error ? t.message : String(t)} (listener: ${r} on ${this.pathOf(n)})`, t instanceof Error ? t.stack : void 0);
		});
	}
	reportRendererError(e) {
		if (this.rendererErrorListener !== null) {
			this.rendererErrorListener(e);
			return;
		}
		console.error(e);
	}
	fallBackToCanvas2D(e) {
		this.renderer === e && (e.dispose(), this.canvasSurface = ad(this.canvas), this.renderer = new td({ surface: this.canvasSurface }), this.rendererState = "canvas2d", this.renderer.resize(this.width, this.height, this.pixelRatio), this.requestRepaint());
	}
	requestRepaint() {
		this.root !== void 0 && this.graph.markDirty(this.root, k.Paint);
	}
	fontsChanged() {
		this.textMeasurer.invalidate?.(), this.renderer.fontsChanged?.(), this.engine.invalidateMeasurements(), this.root !== void 0 && this.graph.markDirty(this.root, k.SubtreeLayout | k.Paint);
	}
	resize(e, t, n = this.pixelRatio) {
		!(e > 0) || !(t > 0) || (this.pixelRatio = n, this.width = e, this.height = t, this.renderer.resize(e, t, n), this.constraints = Y.loose(e, t), this.root !== void 0 && (this.laidOutOnce ? this.graph.markDirty(this.root, k.Layout | k.Paint) : (this.laidOutOnce = !0, this.engine.layout(this.root, this.constraints), this.graph.markDirty(this.root, k.Paint)), this.started && this.scheduler.flush(n_())));
	}
	onFrame(e) {
		this.frameListener = e;
	}
	noteInput(e) {
		this.inputLatency.mark(e, this.scheduler.framePending);
	}
	setInspectorEnabled(e) {
		if (this.inspector.isEnabled === e) return;
		this.inspector.setEnabled(e), e && this.inspector.setHovered(this.input.pointer.hoveredNode);
		let t = this.hoveredReport();
		this.lastInspection = t?.explanation ?? null, this.inspectListener?.(t), this.devtoolsListener?.({
			kind: "hover",
			report: t
		}), this.root !== void 0 && this.graph.markDirty(this.root, k.Paint);
	}
	onInspect(e) {
		this.inspectListener = e;
	}
	onDevtools(e) {
		this.devtoolsListener = e;
	}
	handleDevtools(e) {
		switch (e.kind) {
			case "tree":
				this.sendTree();
				break;
			case "watchTree":
				this.watchingTree = e.enabled, e.enabled && this.sendTree();
				break;
			case "inspect":
				this.devtoolsListener?.({
					kind: "report",
					id: e.id,
					report: this.inspectNodeById(e.id)
				});
				break;
			case "select":
				this.selectedId = e.id, this.lastSelectedReport = null, e.id !== null && this.sendSelectedReport();
				break;
			case "highlight":
				this.setHighlightedNode(e.id);
				break;
			case "watchFrames":
				this.watchingFrames = e.enabled;
				break;
			case "inspector":
				this.setInspectorEnabled(e.enabled);
				break;
			case "setProp":
				this.writeInspectedProperty(e.id, e.name, e.value);
				break;
			case "marks": um(e.enabled);
		}
	}
	writeInspectedProperty(e, t, n) {
		let r = this.graph.getNode(e);
		if (r === void 0) return;
		let i = Ci(t);
		if (n === null) {
			this.graph.applyResolvedProperty(r, t, !1, void 0, i);
			return;
		}
		this.graph.updateNodeProperty(r, t, n, i);
	}
	snapshotTree() {
		let e = this.debugRoot(), t = 0, n = (e) => {
			t++;
			let r = [];
			for (let t = e.firstChild; t !== null; t = t.nextSibling) r.push(n(t));
			let i = this.resolver.hostFor(e.id), a = vg(e.getProperty("text")), o = this.graph.subscriptionsForNode(e);
			return {
				id: e.id,
				type: e.type,
				...i === void 0 ? {} : { component: Gm(i.component).tag },
				...a === void 0 ? {} : { text: a },
				...o === 0 ? {} : { subscriptions: o },
				children: r
			};
		};
		return {
			root: n(e),
			nodes: t,
			subscriptions: this.graph.subscriptionCount
		};
	}
	sendTree() {
		let e = this.snapshotTree();
		this.lastSubscriptions = e.subscriptions, this.devtoolsListener?.({
			kind: "tree",
			tree: e
		});
	}
	inspectNodeById(e) {
		let t = this.graph.getNode(e);
		return t === void 0 ? null : this.inspectNode(t);
	}
	setHighlightedNode(e) {
		let t = e === null ? void 0 : this.graph.getNode(e);
		this.inspector.setHighlighted(t ?? null) && this.root !== void 0 && this.graph.markDirty(this.root, k.Paint);
	}
	onCursor(e) {
		this.cursorListener = e;
	}
	get cursor() {
		return this.lastCursor;
	}
	onScrollability(e) {
		this.scrollabilityListener = e;
	}
	get scrollability() {
		return this.lastScrollability;
	}
	onEditingState(e) {
		this.editingListener = e;
	}
	get editingState() {
		return this.lastEditingState;
	}
	onShellRequest(e) {
		this.shellListener = e;
	}
	onAudioRequest(e) {
		this.audioListener = e;
	}
	applyAudioSample(e) {
		this.services.get(Cg).applySample(e);
	}
	applyAudioAction(e) {
		this.services.get(Cg).applyAction(e);
	}
	setTextInputSource(e) {
		this.input.editing.textFromKeys = e === "keys";
	}
	setFullscreen(e) {
		this.services.get(yg).applyFullscreen(e);
	}
	setVisible(e) {
		this.input.editing.setVisible(e), e !== this.visible && (this.visible = e, this.animations.setHidden(!e), e && this.started && this.scheduler.wake());
	}
	setReducedMotion(e) {
		this.services.get(qg).applyReducedMotion(e);
	}
	setUrl(e) {
		this.services.get(Ng).applyUrl(e);
	}
	setColorScheme(e) {
		this.services.get(yg).applyColorScheme(e);
	}
	setViewportInsets(e) {
		xr(this.viewportInsetValue, e) || (this.viewportInsetValue = e, this.services.get(yg).applyViewportInsets(e), this.publishViewportInsets());
	}
	publishViewportInsets() {
		let e = this.appRoot, t = e === void 0 ? null : (e.environment ?? this.graph.buildNodeEnvironment(e)).get(P.insets), n = t instanceof Sr ? t : null;
		n !== this.viewportInsetRegistry && (this.viewportInsetWrite?.(), this.viewportInsetWrite = null, this.viewportInsetRegistry = n), n !== null && (this.viewportInsetWrite === null ? this.viewportInsetWrite = n.publish(this.viewportInsetValue) : this.viewportInsetWrite(this.viewportInsetValue));
	}
	settlePopup(e, t) {
		this.services.get(yg).settlePopup(e, t);
	}
	settleStorage(e, t) {
		this.services.get(yg).settleStorage(e, t);
	}
	get reducedMotion() {
		return this.animations.isReducedMotion;
	}
	get colorScheme() {
		return this.services.get(yg).currentColorScheme;
	}
	get viewportInsets() {
		return this.viewportInsetValue;
	}
	get sharedElementNames() {
		return this.sharedElements.names;
	}
	explain(e) {
		return this.engine.explain(e);
	}
	inspectNode(e) {
		let t = this.engine.visibleBox(e);
		return {
			id: e.id,
			type: e.type,
			box: {
				x: t.x,
				y: t.y,
				width: t.width,
				height: t.height
			},
			owners: this.ownersOf(e),
			props: this.propsOf(e),
			environment: this.environmentOf(e),
			modifiers: this.builder.modifiersFor(e)?.names ?? [],
			listens: this.dispatcher.listenerTypes(e),
			beneath: this.beneathAtPointer(e),
			semantics: this.semanticsOf(e),
			explanation: fu(this.engine.explain(e))
		};
	}
	beneathAtPointer(e) {
		let t = this.input.pointer.position;
		if (t === null) return [];
		let n = this.hitTester.hitStack(t.x, t.y), r = n.indexOf(e);
		return r === -1 ? [] : n.slice(r + 1).filter((e) => e !== this.root).map((e) => {
			let t = this.ownersOf(e);
			return {
				id: e.id,
				type: e.type,
				...t.length === 0 ? {} : { owner: t[0].name },
				listens: this.dispatcher.listenerTypes(e)
			};
		});
	}
	pathOf(e) {
		let t = this.semanticsOf(e)?.label;
		return hh(this.ownersOf(e), {
			type: e.type,
			id: e.id,
			...t === void 0 ? {} : { label: t }
		});
	}
	ownersOf(e) {
		let t = [];
		for (let n = e; n !== null; n = n.parent) {
			let e = this.resolver.hostFor(n.id);
			e !== void 0 && t.push({
				name: Gm(e.component).tag,
				anchorId: n.id
			});
		}
		return t;
	}
	propsOf(e) {
		let t = lu(e), n = [];
		for (let [r, i] of e.properties) {
			let a = t?.[r];
			if (a !== void 0) {
				n.push({
					name: r,
					value: _h(i),
					origin: "modifier",
					source: a
				});
				continue;
			}
			let o = this.graph.getBindingForProperty(e, r);
			if (o !== void 0) {
				let e = gh(o, i_());
				n.push({
					name: r,
					value: _h(i),
					origin: "binding",
					source: `bound to ${e.source}`,
					stream: e
				});
				continue;
			}
			n.push({
				name: r,
				value: _h(i),
				origin: "element"
			});
		}
		return n.sort((e, t) => e.name.localeCompare(t.name)), n;
	}
	environmentOf(e) {
		let t = e.environment;
		if (t === null) return [];
		let n = t === (e.parent?.environment ?? null) ? null : t, r = /* @__PURE__ */ new Set(), i = [];
		for (let e = t; e !== null; e = e.parent) for (let t of e.providedKeys()) r.has(t) || (r.add(t), i.push({
			key: t,
			value: _h(e.getOwn(t)),
			provided: e === n && n.providesOwn(t)
		}));
		return i.sort((e, t) => e.key.localeCompare(t.key)), i;
	}
	semanticsOf(e) {
		let t = this.semanticsTree().get(e.id);
		if (t !== void 0) return {
			role: t.role,
			label: t.label,
			value: t.valueText ?? (t.valueNow === void 0 ? void 0 : String(t.valueNow)),
			states: t.states
		};
	}
	debugRoot() {
		if (this.appRoot === void 0) throw Error("App root has not been built.");
		return this.appRoot;
	}
	debugLayoutBox(e) {
		return this.engine.worldBox(e);
	}
	debugVisibleBox(e) {
		return this.engine.visibleBox(e);
	}
	layoutRoot() {
		if (this.root === void 0) throw Error("App root has not been built.");
		return this.root;
	}
	scrollIntoView(e, t = 8) {
		for (let n of this.engine.revealAdjustments(e, t)) this.smoothScroller.stop(n.container), n.container.setProperty("scrollX", n.scrollX), n.container.setProperty("scrollY", n.scrollY), this.graph.markDirty(n.container, k.Transform);
	}
	reload(e, t = []) {
		if (this.root === void 0) throw Error("App root has not been built.");
		for (let e of t) this.services.adopt(e) || this.services.register(e);
		this.inspector.setHovered(null), this.inspector.setHighlighted(null), this.focusAfterReload = this.focusManager.focusedNode?.id ?? null, this.restoringFocus = !0, this.buildRoot(e), this.graph.markDirty(this.root, k.Children | k.SubtreeLayout | k.Paint);
	}
	restoreFocusAfterReload() {
		let e = this.focusAfterReload;
		this.focusAfterReload = null;
		let t = e === null ? void 0 : this.graph.getNode(e);
		(t === void 0 || !this.focusManager.focus(t)) && this.focusManager.blur();
	}
	dispose() {
		this.scrollbarTimer !== null && (clearTimeout(this.scrollbarTimer), this.scrollbarTimer = null), this.detachViewportInsetEnvironment?.(), this.detachViewportInsetEnvironment = null, this.viewportInsetWrite?.(), this.viewportInsetWrite = null, this.viewportInsetRegistry = null, this.caretTimer !== null && (clearTimeout(this.caretTimer), this.caretTimer = null), this.editingListener = null, this.shellListener = null, this.semanticsListener = null, this.inspectorTimer !== null && (clearTimeout(this.inspectorTimer), this.inspectorTimer = null), this.animationTimer !== null && (clearTimeout(this.animationTimer), this.animationTimer = null), this.inspectListener = null, this.devtoolsListener = null, this.cursorListener = null, this.scrollabilityListener = null, this.rendererErrorListener = null, this.scheduler.stop(), this.animations.stopAll(), this.sharedElements.clear(), this.animations.setWakeListener(null), this.services.get(qg).setDriver(null), this.services.get(Cg).setAnimations(null), this.services.get(zg).setController(null), this.services.get(Bg).setManager(null), this.services.get(Ng).setHistory(null), this.services.get(Vg).dispose(), this.services.get(Hg).dispose(), this.graph.setEnvironmentChangedListener(null), this.graph.setDirtyListener(null), this.graph.setNodeRemovedListener(null), this.frameListener = null, this.input.touchScroll.dispose(), this.resolver.dispose(), this.renderer.dispose();
	}
	buildRoot(e) {
		let t = this.resolveRootElement(e, 0);
		this.root = this.builder.build(an({
			x: "stretch",
			y: "stretch",
			position: "relative"
		}, t, wh(Oh)));
		let n = this.root.firstChild;
		if (n === null) throw Error("The app root produced no node.");
		this.appRoot = n, this.graph.propagateEnvironment(this.root), this.detachViewportInsetEnvironment?.(), this.detachViewportInsetEnvironment = this.environmentNotifier.add(n, () => this.publishViewportInsets()), this.publishViewportInsets();
	}
	resolveRootElement(e, t) {
		if (At(e)) throw Error("Root definition cannot be an Observable. Wrap it in a component or static element.");
		if (kt(e)) {
			if (t > e_) throw Error(`Root component chain exceeded ${e_} levels without producing an element.`);
			let n = this.resolver.resolve(e, `app:component:${t}`);
			return this.resolveRootElement(n, t + 1);
		}
		return e;
	}
	createInput() {
		let e = this.layoutRoot(), t = new zc(this.engine, e);
		this.hitTester = t;
		let n = this.focusManager;
		n.setRoot(e);
		let r = this.createScrollSink(), i = new yl({
			recordFor: (e) => this.engine.recordFor(e),
			visibleBox: (e) => this.engine.visibleBox(e),
			toLocal: (e, n, r) => t.toLocal(e, n, r),
			measurer: this.textMeasurer,
			markDirty: (e, t) => this.graph.markDirty(e, t),
			reveal: (e, t) => this.revealBox(e, t),
			now: n_
		}, this.dispatcher, n), a = new bm({
			recordFor: (e) => this.engine.recordFor(e),
			visibleBox: (e) => this.engine.visibleBox(e),
			measurer: this.textMeasurer,
			markDirty: (e, t) => this.graph.markDirty(e, t),
			root: () => this.layoutRoot(),
			copy: (e) => this.services.get(yg).copyText(e),
			blurEditable: () => {
				i.focused !== null && n.blur();
			},
			now: n_
		}, t);
		n.onFocusChange((e) => {
			e !== null && a.clear();
		}), this.selectionController = a;
		let o = new jc({
			recordFor: (e) => this.engine.recordFor(e),
			measurer: this.textMeasurer,
			markDirty: (e, t) => this.graph.markDirty(e, t),
			reveal: (e, t) => this.revealBox(e, t),
			root: () => this.layoutRoot(),
			focus: (e) => {
				n.focus(e);
			}
		}, a);
		return this.findController = o, this.services.get(zg).setController(o), {
			dispatcher: this.dispatcher,
			focus: n,
			editing: i,
			selection: a,
			find: o,
			pointer: new Wc(t, this.dispatcher, {
				gestures: new fl(this.dispatcher),
				onPress: (e) => {
					e === null ? n.noteInput("pointer") : n.focusOnPress(e);
				},
				scrollSink: r,
				onHoverChange: (e) => this.handleHoverChange(e),
				editing: i,
				selection: a
			}),
			wheel: new al(t, this.dispatcher, r, () => e),
			keyboard: new qc(this.dispatcher, n, () => this.appRoot ?? this.layoutRoot(), {
				editing: i,
				selection: a,
				find: o,
				activation: { clickAt: (e) => {
					let t = this.engine.visibleBox(e);
					return {
						x: t.x + t.width / 2,
						y: t.y + t.height / 2
					};
				} }
			}),
			touchScroll: new ml(this.dispatcher, e, r)
		};
	}
	onSemantics(e) {
		this.semanticsListener = e, this.semanticsBoxes.clear(), e !== null && this.semanticsTree(), e !== null && this.semantics.size !== 0 && e({
			patches: [...this.semantics.values()].map((e) => ({
				op: "add",
				node: e
			})),
			boxes: this.collectSemanticsBoxes(),
			focused: this.focusManager.focusedNode?.id ?? null
		});
	}
	semanticsTree() {
		return this.semanticsStale &&= (this.semantics = Cm(this.layoutRoot()), !1), this.semantics;
	}
	applySemanticsAction(e) {
		if (this.applyTextRunAction(e)) return;
		let t = this.graph.getNode(e.id);
		if (t === void 0 || !this.semantics.has(e.id)) return;
		if (e.action === "focus") {
			this.focusManager.focus(t);
			return;
		}
		if (e.action === "setValue") {
			this.focusManager.focus(t), this.input.editing.replaceText(e.value ?? "");
			return;
		}
		this.focusManager.focus(t);
		let n = this.engine.visibleBox(t);
		this.dispatcher.dispatch(new N(j.Click, n.x + n.width / 2, n.y + n.height / 2, 1), t);
	}
	applyTextRunAction(e) {
		let t = Pm(e.id);
		if (t === null) return !1;
		if (e.action === "focus" || e.action === "setValue") return !0;
		let n = this.graph.getNode(t.nodeId);
		return n !== void 0 && this.semantics.has(e.id) && yo(n, t.index)?.onClick?.(), !0;
	}
	updateSemantics(e, t, n) {
		let r = f_, i = this.semanticsListener;
		if (t && (i === null ? this.semanticsStale = !0 : r = this.rescopeSemantics(e) ?? this.rebuildSemantics()), i === null) return;
		let a = n || r.length > 0 ? this.collectSemanticsBoxes() : p_, o = this.focusManager.focusedNode?.id ?? null, s = o !== this.lastFocusedId;
		this.lastFocusedId = o, !(r.length === 0 && a.length === 0 && !s) && i(s ? {
			patches: r,
			boxes: a,
			focused: o
		} : {
			patches: r,
			boxes: a
		});
	}
	rebuildSemantics() {
		let e = Cm(this.layoutRoot()), t = zm(this.semantics, e);
		return this.semantics = e, this.semanticsStale = !1, t;
	}
	rescopeSemantics(e) {
		if (this.semantics.size === 0 || this.semanticsStale) return null;
		let t = /* @__PURE__ */ new Set();
		for (let [n, r] of e.entries()) {
			if ((r & k.Children) !== 0) return null;
			if ((r & k.Semantics) === 0) continue;
			let e = this.semanticsOwnerOf(n);
			if (e === null || (t.add(e), t.size > u_)) return null;
		}
		if (t.size === 0) return null;
		let n = [];
		for (let e of t) {
			let t = this.semantics.get(e.id), r = wm(e, t.parent, t.index, Em(e));
			if (r === null) return null;
			let i = 0;
			for (let t of this.semanticIdsUnder(e)) {
				let e = r.get(t);
				if (e === void 0) return null;
				i++, Bm(this.semantics.get(t), e) || n.push(e);
			}
			if (i !== r.size) return null;
		}
		let r = [];
		for (let e of n) this.semantics.set(e.id, e), r.push({
			op: "update",
			node: e
		});
		return r;
	}
	semanticsOwnerOf(e) {
		for (let t = e; t !== null; t = t.parent) if (this.semantics.has(t.id)) return t;
		return null;
	}
	semanticIdsUnder(e) {
		let t = [], n = [e];
		for (; n.length > 0;) {
			let e = n.pop();
			if (this.semantics.has(e.id)) {
				t.push(e.id);
				for (let n = 0;; n++) {
					let r = `${e.id}${Nm}${n}`;
					if (!this.semantics.has(r)) break;
					t.push(r);
				}
			}
			for (let t = e.firstChild; t !== null; t = t.nextSibling) n.push(t);
		}
		return t;
	}
	collectSemanticsBoxes() {
		let e = [], t = this.focusManager.focusedNode?.id;
		for (let n of this.semantics.keys()) {
			let r = this.graph.getNode(n);
			if (r === void 0 || this.engine.recordFor(r) === void 0) continue;
			let i = this.engine.visibleBox(r), a = this.semanticsBoxes.get(n);
			a !== void 0 && m_(a, i) || n !== t && !this.onScreen(i) || (this.semanticsBoxes.set(n, i), e.push({
				id: n,
				box: i
			}));
		}
		if (this.semanticsBoxes.size > this.semantics.size) for (let e of this.semanticsBoxes.keys()) this.semantics.has(e) || this.semanticsBoxes.delete(e);
		return e;
	}
	onScreen(e) {
		return e.x < this.width + d_ && e.y < this.height + d_ && e.x + e.width > -d_ && e.y + e.height > -d_;
	}
	revealBox(e, t) {
		for (let n of this.engine.revealAdjustments(e, 0, t)) this.smoothScroller.stop(n.container), n.container.setProperty("scrollX", n.scrollX), n.container.setProperty("scrollY", n.scrollY), this.graph.markDirty(n.container, k.Transform);
	}
	handleHoverChange(e) {
		this.sendCursor(), this.sendScrollability(), !(!this.inspector.isEnabled || !this.inspector.setHovered(e)) && (this.sendInspection(), this.root !== void 0 && this.graph.markDirty(this.root, k.Paint));
	}
	createScrollSink() {
		return {
			containerState: (e) => {
				let t = this.engine.recordFor(e);
				if (t !== void 0) return {
					scrollX: t.scrollX,
					scrollY: t.scrollY,
					maxScrollX: Math.max(0, t.contentWidth - t.width),
					maxScrollY: Math.max(0, t.contentHeight - t.height),
					horizontal: e.getProperty("direction") === "row" || e.type === A.Row,
					viewportWidth: t.width,
					viewportHeight: t.height
				};
			},
			scrollBy: (e, t, n, r) => {
				let i = this.engine.recordFor(e);
				if (i !== void 0) {
					if (r === "smooth") {
						t !== 0 && this.smoothScroller.scrollBy(e, "scrollX", t, i.scrollX), n !== 0 && this.smoothScroller.scrollBy(e, "scrollY", n, i.scrollY);
						return;
					}
					this.smoothScroller.stop(e), t !== 0 && e.setProperty("scrollX", i.scrollX + t), n !== 0 && e.setProperty("scrollY", i.scrollY + n), this.graph.markDirty(e, k.Transform);
				}
			},
			scrollContainers: () => this.engine.scrollContainers(),
			revealScrollbars: (e) => {
				this.engine.revealScrollbars(e), this.graph.markDirty(e, k.Paint);
			},
			scrollbar: (e, t) => {
				let n = this.engine.recordFor(e);
				return n === void 0 ? null : Pc(n, t);
			}
		};
	}
	runPreCollectPhases(e) {
		this.phaseTimings = c_(), this.phaseTimings.ticks = this.timePhase(() => this.visible && this.animations.isRunning, () => this.animations.advance(e)), this.scheduleAnimationTick(e), this.phaseTimings.patches = this.timePhase(() => this.replicas.some((e) => e.hasPendingPatches), () => {
			for (let e of this.replicas) e.flush();
		}), this.phaseTimings.environment = this.timePhase(() => this.graph.hasEnvironmentDirty(), () => this.graph.processEnvironmentDirty()), this.phaseTimings.virtualize = this.timePhase(() => this.hasVirtualWindows(), () => this.updateVirtualWindows());
	}
	hasVirtualWindows() {
		for (let e of this.engine.scrollContainers()) if (e.properties.get("virtualWindow") instanceof da || e.properties.get("virtualSheet") instanceof va) return !0;
		return !1;
	}
	updateVirtualWindows() {
		for (let e of this.engine.scrollContainers()) {
			this.updateVirtualSheet(e);
			let t = e.properties.get(ua);
			if (!(t instanceof da)) continue;
			let n = this.engine.recordFor(e);
			if (n === void 0) continue;
			let r = t.axis === "column", i = e.properties.get(r ? "scrollY" : "scrollX"), a = typeof i == "number" ? i : r ? n.scrollY : n.scrollX, o = [], s = this.collectVirtualMeasures(e, r, o), c = t.update({
				scroll: a,
				extent: r ? n.height : n.width,
				lead: s
			}, o);
			if (c.scrollAdjust !== 0) {
				let t = r ? "scrollY" : "scrollX";
				e.setProperty(t, a + c.scrollAdjust), this.graph.markDirty(e, k.Transform), this.smoothScroller.adjust(e, t, c.scrollAdjust);
			}
		}
	}
	updateVirtualSheet(e) {
		let t = e.properties.get(ga);
		if (!(t instanceof va)) return;
		let n = this.engine.recordFor(e);
		if (n === void 0) return;
		let r = e.properties.get("scrollX"), i = e.properties.get("scrollY");
		t.update({
			scrollX: typeof r == "number" ? r : n.scrollX,
			scrollY: typeof i == "number" ? i : n.scrollY,
			width: n.width,
			height: n.height
		});
	}
	collectVirtualMeasures(e, t, n) {
		let r = 0;
		for (let i = e.firstChild; i !== null; i = i.nextSibling) {
			let e = i.properties.get(ca);
			if (typeof e != "number") {
				if (i.type === A.Fragment || i.type === A.Grid) {
					r += this.collectVirtualMeasures(i, t, n);
					continue;
				}
				i.properties.get("virtualLead") === !0 && (r += this.extentOf(i, t));
				continue;
			}
			this.engine.recordFor(i) !== void 0 && n.push({
				index: e,
				extent: this.extentOf(i, t)
			});
		}
		return r;
	}
	extentOf(e, t) {
		let n = this.engine.recordFor(e);
		return n === void 0 ? 0 : t ? n.measuredHeight + n.marginTop + n.marginBottom : n.measuredWidth + n.marginLeft + n.marginRight;
	}
	handleFrame(e) {
		let t = this.root;
		if (t === void 0) return;
		let n = n_();
		this.focusManager.settleScope();
		let r = l_(e);
		this.phaseTimings.layout = this.timePhase(() => r, () => this.engine.layoutForFrame(e, this.constraints, t)), r && (this.laidOutOnce = !0, this.inspector.recordLayout(n)), this.layoutNotifier.isEmpty() || this.layoutNotifier.notify((e) => {
			let t = this.engine.recordFor(e);
			return {
				box: this.engine.visibleBox(e),
				scrollX: t?.scrollX ?? 0,
				scrollY: t?.scrollY ?? 0
			};
		}), this.restoringFocus && r && (this.restoringFocus = !1, this.restoreFocusAfterReload()), this.sendEditingState();
		let i = g_(e);
		this.phaseTimings.semantics = this.timePhase(() => i || this.semanticsListener !== null && (r || this.focusManager.focusedNode?.id !== this.lastFocusedId), () => this.updateSemantics(e, i, r)), this.renderer.backend === "webgpu" && this.renderer.isLost && this.fallBackToCanvas2D(this.renderer);
		let a = this.inspector.hasOverlay ? this.inspector.overlay(n) : null;
		this.gpuTimings = null, this.phaseTimings.render = this.timePhase(() => this.renderer.isReady, () => this.renderer.render(t, {
			layout: this.engine,
			text: this.textMeasurer,
			now: n,
			overlay: a?.shapes
		})), a !== null && (r && this.sendInspection(), this.scheduleInspectorRepaint(a.nextChange)), this.sendDevtoolsUpdates(e);
		let o = n_(), s = o - n;
		this.lastFrameMs = s, this.scheduleScrollbarFade(o), this.scheduleCaretBlink(o), this.sendCursor(), this.sendScrollability();
		let c = {
			frame: e.id,
			durationMs: s,
			nodes: e.size,
			measured: this.engine.stats.measured,
			relayoutRoots: this.engine.stats.fullLayout ? 0 : this.engine.stats.relayoutRoots,
			at: o,
			inputLatencyMs: this.inputLatency.take(r_(o)),
			phases: this.phaseTimings,
			renderer: this.rendererState,
			gpu: this.gpuTimings
		};
		this.frameListener?.(c), this.watchingFrames && this.devtoolsListener?.({
			kind: "frame",
			metrics: c
		}), this.services.get(Jg).publish(c);
	}
	scheduleAnimationTick(e) {
		if (!this.visible) return;
		let t = this.animations.nextTickAt(e);
		if (t !== void 0) {
			if (t <= e) {
				this.scheduler.wake();
				return;
			}
			this.animationTimer === null && (this.animationTimer = setTimeout(() => {
				this.animationTimer = null, this.scheduler.wake();
			}, Math.max(1, t - e)));
		}
	}
	scheduleScrollbarFade(e) {
		let t = this.engine.nextScrollbarChange(e);
		t !== void 0 && this.scrollbarTimer === null && (this.scrollbarTimer = setTimeout(() => {
			this.scrollbarTimer = null, this.root !== void 0 && this.graph.markDirty(this.root, k.Paint);
		}, Math.max(16, t - e)));
	}
	scheduleCaretBlink(e) {
		let t = this.input.editing.nextCaretChange(e);
		t !== void 0 && this.caretTimer === null && (this.caretTimer = setTimeout(() => {
			this.caretTimer = null;
			let e = this.input.editing.focused;
			e !== null && this.graph.markDirty(e, k.Paint);
		}, Math.max(16, t - e)));
	}
	sendEditingState() {
		let e = this.input.editing.state();
		a_(e, this.lastEditingState) || (this.lastEditingState = e, this.editingListener?.(e));
	}
	scheduleInspectorRepaint(e) {
		e !== void 0 && this.inspectorTimer === null && (this.inspectorTimer = setTimeout(() => {
			this.inspectorTimer = null, this.root !== void 0 && this.inspector.isEnabled && this.graph.markDirty(this.root, k.Paint);
		}, Math.max(16, e)));
	}
	sendCursor() {
		let e = To(this.input.pointer.hoveredNode);
		e !== this.lastCursor && (this.lastCursor = e, this.cursorListener?.(e));
	}
	sendScrollability() {
		let e = this.input.pointer.hoveredNode ?? this.input.wheel.lastWheelTarget, t = this.input.wheel.scrollabilityOf(e), n = this.input.wheel.scrollsAnything(), r = this.lastScrollability;
		(t.up !== r.up || t.down !== r.down || t.left !== r.left || t.right !== r.right || n !== this.lastScrollsAnything) && (this.lastScrollability = t, this.lastScrollsAnything = n, this.scrollabilityListener?.(t, n));
	}
	sendInspection() {
		let e = this.inspector.explainHoveredText();
		if (e === this.lastInspection) return;
		this.lastInspection = e;
		let t = this.hoveredReport();
		this.inspectListener?.(t), this.devtoolsListener?.({
			kind: "hover",
			report: t
		});
	}
	hoveredReport() {
		let e = this.inspector.hoveredNode;
		return e === null ? null : this.inspectNode(e);
	}
	sendDevtoolsUpdates(e) {
		if (this.devtoolsListener === null) return;
		let t = this.inspector.highlightedNode;
		t !== null && this.graph.getNode(t.id) !== t && this.inspector.setHighlighted(null), this.watchingTree && (h_(e) || this.graph.subscriptionCount !== this.lastSubscriptions) && this.sendTree(), this.selectedId !== null && this.sendSelectedReport();
	}
	sendSelectedReport() {
		let e = this.selectedId;
		if (e === null) return;
		let t = this.inspectNodeById(e);
		if (t === null) {
			this.selectedId = null, this.lastSelectedReport = null, this.devtoolsListener?.({
				kind: "report",
				id: e,
				report: null
			});
			return;
		}
		let n = JSON.stringify(t);
		n !== this.lastSelectedReport && (this.lastSelectedReport = n, this.devtoolsListener?.({
			kind: "report",
			id: e,
			report: t
		}));
	}
	timePhase(e, t) {
		if (!e()) return 0;
		let n = n_();
		return t(), n_() - n;
	}
	get lastFrameDurationMs() {
		return this.lastFrameMs;
	}
};
function n_() {
	return typeof performance < "u" ? performance.now() : Date.now();
}
function r_(e) {
	return i_() + e;
}
function i_() {
	return typeof performance < "u" ? performance.timeOrigin : 0;
}
function a_(e, t) {
	return e === null || t === null ? e === t : e.text === t.text && e.selectionStart === t.selectionStart && e.selectionEnd === t.selectionEnd && e.multiline === t.multiline && e.composing === t.composing && e.caret.x === t.caret.x && e.caret.y === t.caret.y && e.caret.width === t.caret.width && e.caret.height === t.caret.height;
}
function o_() {
	if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(1, 1);
	if (typeof document < "u") {
		let e = document.createElement("canvas");
		return e.width = 1, e.height = 1, e;
	}
	throw Error("GessoRuntime: no canvas is available for text measurement; pass `measureCanvas`.");
}
function s_() {
	return {
		prepare: 0,
		upload: 0,
		encode: 0
	};
}
function c_() {
	return {
		ticks: 0,
		patches: 0,
		environment: 0,
		virtualize: 0,
		layout: 0,
		semantics: 0,
		render: 0
	};
}
function l_(e) {
	return e.anyFlags(k.Layout | k.Children | k.SubtreeLayout | k.Transform);
}
var u_ = 32, d_ = 400, f_ = [], p_ = [];
function m_(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function h_(e) {
	return g_(e);
}
function g_(e) {
	return e.anyFlags(k.Semantics | k.Children);
}
//#endregion
//#region packages/framework/src/app/GessoApp.ts
var __ = class {
	runtime;
	canvas;
	host;
	inputEnabled;
	accessibilityEnabled;
	adapter;
	historyOptions;
	running = !1;
	resizeObserver = null;
	proxy = null;
	audio = null;
	mirror = null;
	history = null;
	detachVisibility = null;
	detachFullscreen = null;
	fullscreen = !1;
	detachReducedMotion = null;
	detachColorScheme = null;
	detachViewportInsets = null;
	colorSchemePreference = "auto";
	constructor(e) {
		this.host = e.host, this.canvas = e.canvas ?? v_(), this.inputEnabled = e.input ?? !0, this.accessibilityEnabled = e.accessibility ?? !0, this.historyOptions = e.history, this.colorSchemePreference = e.colorScheme ?? "auto", this.runtime = new t_({
			root: e.root,
			canvas: this.canvas,
			renderer: e.renderer,
			services: e.services,
			channels: e.channels,
			routes: e.routes,
			media: e.media,
			fonts: e.fonts,
			clock: e.clock ?? ((e) => new gm(e)),
			dpr: b_()
		});
		let t = this.runtime.input;
		this.adapter = new xl({
			pointerController: t.pointer,
			wheelController: t.wheel,
			keyboardController: t.keyboard
		});
	}
	get services() {
		return this.runtime.services;
	}
	get input() {
		return this.adapter;
	}
	mount() {
		if (this.running) return;
		this.running = !0, y_(this.canvas) && this.canvas.parentElement !== this.host && (this.host.appendChild(this.canvas), this.canvas.style.display = "block", this.canvas.style.width = "100%", this.canvas.style.height = "100%"), this.observeResize();
		let e = y_(this.canvas) ? _g(this.canvas, this.host) : void 0;
		this.resize(e?.width ?? this.canvas.width ?? 600, e?.height ?? this.canvas.height ?? 600), this.attachInput(), this.attachHistory(), this.attachViewportInsets(), this.runtime.onCursor((e) => {
			y_(this.canvas) && (this.canvas.style.cursor = e ?? "");
		}), this.runtime.start();
	}
	deferPatchesFrom(e) {
		this.runtime.deferPatchesFrom(e);
	}
	onFrame(e) {
		this.runtime.onFrame(e);
	}
	get rendererReady() {
		return this.runtime.rendererReady;
	}
	resize(e, t) {
		this.runtime.resize(e, t, b_());
	}
	reload(e, t = []) {
		this.runtime.reload(e, t);
	}
	setInspector(e) {
		this.runtime.setInspectorEnabled(e);
	}
	setColorScheme(e) {
		if (this.detachColorScheme?.(), this.detachColorScheme = null, this.colorSchemePreference = e, e === "auto") {
			this.detachColorScheme = ag((e) => this.runtime.setColorScheme(e));
			return;
		}
		this.runtime.setColorScheme(e);
	}
	onInspect(e) {
		this.runtime.onInspect(e);
	}
	onDevtools(e) {
		this.runtime.onDevtools(e);
	}
	devtools(e) {
		this.runtime.handleDevtools(e);
	}
	onError(e) {
		this.runtime.onRendererError(e === null ? null : (t) => e(t, void 0, "renderer")), this.runtime.onListenerError(e === null ? null : (t, n) => e(t, n, "listener"));
	}
	debugRoot() {
		return this.runtime.debugRoot();
	}
	dispose() {
		this.running = !1, this.audio?.dispose(), this.audio = null, this.runtime.onAudioRequest(null), this.proxy?.dispose(), this.proxy = null, this.mirror?.dispose(), this.mirror = null, this.detachVisibility?.(), this.detachVisibility = null, this.detachFullscreen?.(), this.detachFullscreen = null, this.detachReducedMotion?.(), this.detachReducedMotion = null, this.detachColorScheme?.(), this.detachColorScheme = null, this.detachViewportInsets?.(), this.detachViewportInsets = null, this.history?.dispose(), this.history = null, this.adapter.detach(), this.resizeObserver?.disconnect(), this.resizeObserver = null, y_(this.canvas) && this.canvas.parentElement === this.host && this.host.removeChild(this.canvas), this.runtime.dispose();
	}
	attachInput() {
		if (!this.inputEnabled || !y_(this.canvas)) return;
		this.canvas.tabIndex = 0, Tl(this.canvas), this.adapter.attach(new Dl(this.canvas));
		let e = this.runtime.input.editing, t = this.canvas;
		if (this.proxy = new Bh(t, {
			beforeInput: (t, n) => e.beforeInput(t, n),
			compositionStart: () => e.compositionStart(),
			compositionUpdate: (t, n) => e.compositionUpdate(t, n),
			compositionEnd: (t) => e.compositionEnd(t),
			paste: (t) => e.paste(t),
			blur: () => this.runtime.input.focus.blur()
		}), this.runtime.setTextInputSource("proxy"), this.runtime.onEditingState((e) => this.proxy?.update(e)), this.audio = new Ih({
			sample: (e) => this.runtime.applyAudioSample(e),
			action: (e) => this.runtime.applyAudioAction(e)
		}), this.runtime.onAudioRequest((e) => this.audio?.handle(e)), this.attachSemanticsMirror(t), typeof document < "u") {
			let e = () => this.runtime.setVisible(document.visibilityState !== "hidden");
			document.addEventListener("visibilitychange", e), this.detachVisibility = () => document.removeEventListener("visibilitychange", e), this.detachFullscreen = mg(t, (e) => {
				this.fullscreen = e, this.runtime.setFullscreen(e), gg(() => {
					let n = hg(t, this.host, e);
					n !== null && this.resize(n.width, n.height);
				});
			}), this.runtime.setFullscreen(pg(t));
		}
		this.detachReducedMotion = og((e) => this.runtime.setReducedMotion(e)), this.setColorScheme(this.colorSchemePreference);
	}
	attachSemanticsMirror(e) {
		if (!this.accessibilityEnabled) return;
		let t = new Xh(e, {
			action: (e) => this.runtime.applySemanticsAction(e),
			paste: (e) => this.runtime.input.editing.paste(e)
		}, this.proxy);
		this.mirror = t, this.runtime.onSemantics((e) => t.apply(e));
	}
	attachHistory() {
		let e = sg(this.historyOptions);
		this.history = e, this.runtime.onShellRequest((t) => this.handleShellRequest(t, e)), e.onChange((e) => this.runtime.setUrl(e)), this.runtime.setUrl(e.url);
	}
	attachViewportInsets() {
		this.detachViewportInsets = Cr((e) => this.runtime.setViewportInsets(e));
	}
	handleShellRequest(e, t) {
		if (e.type === "history") {
			e.action === "push" ? t.push(e.url) : e.action === "replace" ? t.replace(e.url) : e.action === "back" ? t.back() : t.forward();
			return;
		}
		if (!y_(this.canvas)) {
			e.type === "popup" ? this.runtime.settlePopup(e.id, !1) : e.type === "storage" && this.runtime.settleStorage(e.id, rg());
			return;
		}
		if (e.type === "clipboard") {
			Vh(e.text, this.canvas.ownerDocument);
			return;
		}
		if (e.type === "fullscreen") {
			dg(this.canvas, e.enter);
			return;
		}
		let n = this.canvas.ownerDocument.defaultView;
		if (e.type === "storage") {
			this.runtime.settleStorage(e.id, ng(e, () => n?.localStorage));
			return;
		}
		if (e.type === "popup") {
			let t = !1;
			try {
				let r = `popup,width=${e.width},height=${e.height}`;
				t = (n?.open(e.url, e.name, r) ?? null) !== null;
			} catch {
				t = !1;
			}
			this.runtime.settlePopup(e.id, t);
			return;
		}
		n?.open(e.url, "_blank", "noopener,noreferrer");
	}
	observeResize() {
		typeof ResizeObserver > "u" || (this.resizeObserver = new ResizeObserver((e) => {
			let t = e[0];
			t !== void 0 && (this.fullscreen || this.resize(t.contentRect.width, t.contentRect.height));
		}), this.resizeObserver.observe(this.host));
	}
};
function v_() {
	return document.createElement("canvas");
}
function y_(e) {
	return typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement;
}
function b_() {
	return typeof window < "u" && window.devicePixelRatio || 1;
}
//#endregion
//#region packages/framework/src/app/GessoAppBuilder.ts
var x_ = class {
	root;
	channelRegistrations = [];
	serviceRegistrations = [];
	frameListener;
	inspectListener;
	devtoolsListener = null;
	errorListener;
	rendererChoice;
	routes;
	historyOptions;
	mediaOptions;
	fontDeclarations;
	app;
	colorSchemePreference = "auto";
	constructor(e) {
		this.root = e;
	}
	useChannel(e, t) {
		return this.channelRegistrations.push({
			token: e,
			worker: t.worker,
			source: t.source
		}), this;
	}
	useService(e) {
		return this.serviceRegistrations.push(e), this;
	}
	useRoutes(e) {
		return this.routes = e, this;
	}
	useMedia(e) {
		return this.mediaOptions = e, this;
	}
	useFonts(e) {
		return this.fontDeclarations = e, this;
	}
	useHistory(e) {
		return this.historyOptions = e, this;
	}
	renderer(e) {
		return this.rendererChoice = e, this;
	}
	onFrame(e) {
		return this.frameListener = e, this;
	}
	onInspect(e) {
		return this.inspectListener = e, this;
	}
	onError(e) {
		return this.errorListener = e, this;
	}
	setInspector(e) {
		this.app?.setInspector(e);
	}
	onDevtools(e) {
		this.devtoolsListener = e, this.app?.onDevtools(e);
	}
	devtools(e) {
		this.app?.devtools(e);
	}
	reload(e, t = []) {
		return this.root = e, this.app?.reload(typeof e == "function" ? wh(e) : e, t), this;
	}
	setColorScheme(e) {
		return this.colorSchemePreference = e, this.app?.setColorScheme(e), this;
	}
	mountSync(e) {
		let t = typeof e == "string" ? S_(e) : e, n = typeof this.root == "function" ? wh(this.root) : this.root, r = Ch(this.channelRegistrations), i = new Be();
		for (let e of this.serviceRegistrations) i.register(e);
		let a = new __({
			host: t,
			root: n,
			channels: r.registry,
			services: i,
			routes: this.routes,
			media: this.mediaOptions,
			fonts: this.fontDeclarations,
			history: this.historyOptions,
			renderer: this.rendererChoice,
			colorScheme: this.colorSchemePreference
		});
		return a.deferPatchesFrom(r.registry.all()), this.frameListener !== void 0 && a.onFrame(this.frameListener), this.inspectListener !== void 0 && a.onInspect(this.inspectListener), this.errorListener !== void 0 && a.onError(this.errorListener), this.devtoolsListener !== null && a.onDevtools(this.devtoolsListener), this.app = a, a.mount(), () => {
			this.app = void 0, a.dispose(), r.dispose();
		};
	}
};
function S_(e) {
	let t = document.querySelector(e);
	if (t === null) throw Error(`Mount host '${e}' was not found.`);
	return t;
}
//#endregion
//#region packages/framework/src/app/createSyncApp.ts
function C_(e) {
	return new x_(e);
}
//#endregion
//#region .probe/sync.ts
C_(() => nn({ text: "hi" })).mountSync("#app");
//#endregion
