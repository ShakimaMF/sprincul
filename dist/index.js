// node_modules/nanostores/clean-stores/index.js
var clean = Symbol("clean");

// node_modules/nanostores/atom/index.js
var listenerQueue = [];
var lqIndex = 0;
var batchSeen = null;
var QUEUE_ITEMS_PER_LISTENER = 4;
var nanostoresGlobal = globalThis.nanostoresGlobal ||= { epoch: 0 };
var drainQueue = () => {
  let thrown;
  let i;
  while (lqIndex < listenerQueue.length) {
    i = lqIndex;
    lqIndex += QUEUE_ITEMS_PER_LISTENER;
    try {
      listenerQueue[i](listenerQueue[i + 1].value, listenerQueue[i + 2], listenerQueue[i + 3]);
    } catch (e) {
      thrown = e;
    }
  }
  listenerQueue.length = lqIndex = 0;
  if (thrown)
    throw thrown;
};
var atom = (initialValue) => {
  let listeners = [];
  let $atom = {
    eq: Object.is,
    get() {
      if (!$atom.lc) {
        $atom.listen(() => {})();
      }
      return $atom.value;
    },
    init: initialValue,
    lc: 0,
    listen(listener) {
      $atom.lc = listeners.push(listener);
      return () => {
        for (let i = lqIndex;i < listenerQueue.length; ) {
          if (listenerQueue[i] === listener) {
            listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
          } else {
            i += QUEUE_ITEMS_PER_LISTENER;
          }
        }
        let index = listeners.indexOf(listener);
        if (~index) {
          listeners.splice(index, 1);
          if (!--$atom.lc)
            $atom.off();
        }
      };
    },
    notify(oldValue, changedKey) {
      nanostoresGlobal.epoch++;
      let runListenerQueue = !listenerQueue.length && !batchSeen;
      for (let listener of listeners) {
        if (batchSeen?.has(listener))
          continue;
        batchSeen?.add(listener);
        listenerQueue.push(listener, $atom, oldValue, batchSeen ? undefined : changedKey);
      }
      if (runListenerQueue) {
        drainQueue();
      }
    },
    off() {},
    set(newValue) {
      let oldValue = $atom.value;
      if (!$atom.eq(oldValue, newValue)) {
        $atom.value = newValue;
        $atom.notify(oldValue);
      }
    },
    subscribe(listener) {
      let unbind = $atom.listen(listener);
      listener($atom.value);
      return unbind;
    },
    value: initialValue
  };
  if (true) {
    $atom[clean] = () => {
      listeners = [];
      $atom.lc = 0;
      $atom.off();
    };
  }
  return $atom;
};
// node_modules/nanostores/lifecycle/index.js
var MOUNT = 5;
var UNMOUNT = 6;
var REVERT_MUTATION = 10;
var on = (object, listener, eventKey, mutateStore) => {
  object.events = object.events || {};
  if (!object.events[eventKey + REVERT_MUTATION]) {
    object.events[eventKey + REVERT_MUTATION] = mutateStore((eventProps) => {
      object.events[eventKey].reduceRight((event, l) => (l(event), event), {
        shared: {},
        ...eventProps
      });
    });
  }
  object.events[eventKey] = object.events[eventKey] || [];
  object.events[eventKey].push(listener);
  return () => {
    let currentListeners = object.events[eventKey];
    let index = currentListeners.indexOf(listener);
    if (~index) {
      currentListeners.splice(index, 1);
      if (!currentListeners.length) {
        object.events[eventKey + REVERT_MUTATION]();
        delete object.events[eventKey + REVERT_MUTATION];
      }
    }
  };
};
var STORE_UNMOUNT_DELAY = 1000;
var onMount = ($store, initialize) => {
  let listener = (payload) => {
    let destroy = initialize(payload);
    if (destroy)
      $store.events[UNMOUNT].push(destroy);
  };
  return on($store, listener, MOUNT, (runListeners) => {
    let originListen = $store.listen;
    $store.listen = (...args) => {
      if (!$store.lc && !$store.active) {
        $store.active = true;
        runListeners();
      }
      return originListen(...args);
    };
    let originOff = $store.off;
    $store.events[UNMOUNT] = [];
    $store.off = () => {
      originOff();
      setTimeout(() => {
        if ($store.active && !$store.lc) {
          $store.active = false;
          for (let destroy of $store.events[UNMOUNT])
            destroy();
          $store.events[UNMOUNT] = [];
        }
      }, STORE_UNMOUNT_DELAY);
    };
    if (true) {
      let originClean = $store[clean];
      $store[clean] = () => {
        for (let destroy of $store.events[UNMOUNT])
          destroy();
        $store.events[UNMOUNT] = [];
        $store.active = false;
        originClean();
      };
    }
    return () => {
      $store.listen = originListen;
      $store.off = originOff;
    };
  });
};

// node_modules/nanostores/warn/index.js
var warned = {};
function warn(text) {
  if (!warned[text]) {
    warned[text] = true;
    if (typeof console !== "undefined" && console.warn) {
      console.groupCollapsed("Nano Stores: " + text);
      console.trace("Source of deprecated call");
      console.groupEnd();
    }
  }
}

// node_modules/nanostores/computed/index.js
var computedStore = (stores, cb, batched) => {
  if (!Array.isArray(stores))
    stores = [stores];
  let previousArgs;
  let currentEpoch;
  let set = () => {
    if (currentEpoch === nanostoresGlobal.epoch)
      return;
    currentEpoch = nanostoresGlobal.epoch;
    let args = stores.map(($store) => $store.get());
    if (!previousArgs?.every((arg, i) => stores[i].eq(arg, args[i]))) {
      previousArgs = args;
      let value = cb(...args);
      if (value && value.then && value.t) {
        if (true) {
          warn("Use @nanostores/async for async computed. We will remove Promise support in computed() in Nano Stores 2.0");
        }
        value.then((asyncValue) => {
          if (previousArgs === args) {
            $computed.set(asyncValue);
          }
        });
      } else {
        $computed.set(value);
        currentEpoch = nanostoresGlobal.epoch;
      }
    }
  };
  let $computed = atom();
  let get = $computed.get;
  $computed.get = () => {
    set();
    return get();
  };
  if (true) {
    let cleanComputed = $computed[clean];
    $computed[clean] = () => {
      previousArgs = undefined;
      currentEpoch = undefined;
      $computed.value = undefined;
      cleanComputed();
    };
  }
  let timer;
  let run = batched ? () => {
    clearTimeout(timer);
    timer = setTimeout(set);
  } : set;
  onMount($computed, () => {
    let unbinds = stores.map(($store) => $store.listen(run));
    set();
    return () => {
      for (let unbind of unbinds)
        unbind();
    };
  });
  return $computed;
};
var computed = (stores, fn) => computedStore(stores, fn);
// node_modules/nanostores/map/index.js
var map = (initial = {}) => {
  let $map = atom(initial);
  $map.eqKey = Object.is;
  $map.setKey = function(key, value) {
    let oldMap = $map.value;
    if (typeof value === "undefined" && key in $map.value) {
      $map.value = { ...$map.value };
      delete $map.value[key];
      $map.notify(oldMap, key);
    } else if (!$map.eqKey($map.value[key], value, key)) {
      $map.value = {
        ...$map.value,
        [key]: value
      };
      $map.notify(oldMap, key);
    }
  };
  return $map;
};
// src/registry.ts
var cores = new WeakMap;
function getCore(model) {
  return cores.get(model);
}
function setCore(model, core) {
  cores.set(model, core);
}
function deleteCore(model) {
  cores.delete(model);
}
var instances = new WeakMap;
function getInstance(element) {
  return instances.get(element);
}
function setInstance(element, model) {
  instances.set(element, model);
}
function deleteInstance(model) {
  if (instances.get(model.$el) === model)
    instances.delete(model.$el);
}
var controllers = new WeakMap;
var abortedUnread = new WeakSet;
function getSignal(model) {
  let controller = controllers.get(model);
  if (!controller) {
    controller = new AbortController;
    controllers.set(model, controller);
    if (abortedUnread.has(model))
      controller.abort();
  }
  return controller.signal;
}
function abortSignal(model) {
  const controller = controllers.get(model);
  if (controller)
    return controller.abort();
  abortedUnread.add(model);
}
var modelRootSelector = "[data-model]";
function addModelTag(tag) {
  modelRootSelector += `, ${tag.replace(/[^\w\u00A0-\u{10FFFF}-]/gu, "\\$&")}`;
}
function closestModelRoot(element) {
  return element?.closest(modelRootSelector) ?? null;
}
function isModelRoot(element) {
  return element.matches(modelRootSelector);
}

// src/SprinculCore.ts
var wiring = ({ wiredBy, wiredOutside }) => ({ wiredBy, wiredOutside });

class SprinculCore {
  instance;
  devMode;
  #bindings = new Map;
  #recordsByElement = new Map;
  #recordsByWire = new Map;
  #computed = new Map;
  #unsubscribers = new Set;
  #pendingUpdates = new Set;
  #updateScheduled = false;
  #pendingInitialCallbacks = [];
  #pendingListeners = [];
  #frameCallbacks = [];
  #isBrowser;
  constructor(instance, devMode = false) {
    this.instance = instance;
    this.devMode = devMode;
    this.#isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  }
  static createStateProxy(stateStore, getCoreRef) {
    const getStateValue = (prop) => {
      if (typeof prop !== "string")
        return;
      const core = getCoreRef();
      if (core?.hasComputed(prop)) {
        return core.getComputed(prop);
      }
      return stateStore.get()[prop];
    };
    return new Proxy({}, {
      get: (_, prop) => {
        return getStateValue(prop);
      },
      set: (_, prop, value) => {
        if (typeof prop !== "string")
          return false;
        stateStore.setKey(prop, value);
        return true;
      },
      deleteProperty: (_, prop) => {
        if (typeof prop !== "string")
          return false;
        const current = stateStore.get();
        if (!(prop in current))
          return true;
        const { [prop]: _deleted, ...next } = current;
        stateStore.set(next);
        const core = getCoreRef();
        core?.scheduleUpdate(prop);
        return true;
      },
      ownKeys: () => {
        return Reflect.ownKeys(stateStore.get());
      },
      has: (_, prop) => {
        if (typeof prop !== "string")
          return false;
        const core = getCoreRef();
        if (core?.hasComputed(prop))
          return true;
        return prop in stateStore.get();
      },
      getOwnPropertyDescriptor: (_, prop) => {
        if (typeof prop !== "string")
          return;
        const descriptor = { configurable: true, enumerable: true };
        const state = stateStore.get();
        if (prop in state) {
          return { ...descriptor, writable: true, value: state[prop] };
        }
        const core = getCoreRef();
        if (core?.hasComputed(prop)) {
          return { ...descriptor, writable: false, value: core.getComputed(prop) };
        }
        return;
      }
    });
  }
  setupBindings(container) {
    const defaults = {};
    this.#processTree(container, { defaults, deferCallbacks: true });
    return SprinculCore.#matchAnyCase(defaults);
  }
  static #matchAnyCase(defaults) {
    const resolve = (prop) => {
      if (typeof prop !== "string" || Object.hasOwn(defaults, prop))
        return prop;
      const folded = prop.toLowerCase();
      return Object.keys(defaults).find((name) => name.toLowerCase() === folded) ?? prop;
    };
    return new Proxy(defaults, {
      get: (target, prop) => Reflect.get(target, resolve(prop)),
      has: (target, prop) => Reflect.has(target, resolve(prop)),
      getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, resolve(prop))
    });
  }
  processAddedElement(content) {
    if (this.instance.$el.contains(content)) {
      this.#releaseRecords(this.#goneFrom(content));
      this.#processTree(content, { deferCallbacks: false, wiredBy: content });
      return;
    }
    if (content.isConnected) {
      this.#warn("wire() was given content on the page outside this model, so nothing was bound.");
      return;
    }
    this.#processTree(content, {
      deferCallbacks: false,
      deferToFrame: this.#isBrowser,
      wiredBy: content,
      wiredOutside: true
    });
  }
  #goneFrom(content) {
    const gone = new Set;
    this.#recordsByWire.get(content)?.forEach((record) => {
      if (!content.contains(record.element))
        gone.add(record);
    });
    this.#leftModel().forEach((record) => gone.add(record));
    return gone;
  }
  #leftModel() {
    const pending = new Set(this.#frameCallbacks);
    const left = [];
    this.#recordsByElement.forEach((records, node) => {
      if (this.instance.$el.contains(node))
        return;
      records.forEach((record) => {
        if (record.wiredOutside && !pending.has(record))
          left.push(record);
      });
    });
    return left;
  }
  unwireElement(element) {
    const released = new Set(this.#recordsByWire.get(element));
    this.#recordsByElement.forEach((records, node) => {
      if (!element.contains(node))
        return;
      records.forEach((record) => {
        if (record.wiredBy)
          released.add(record);
      });
    });
    this.#leftModel().forEach((record) => released.add(record));
    this.#releaseRecords(released);
  }
  applyWatchedChanges(watched, added, removed) {
    if (removed.size > 0) {
      const released = new Set;
      this.#recordsByElement.forEach((records, element) => {
        if (watched.contains(element))
          return;
        for (let node = element;node; node = node.parentElement) {
          if (!removed.has(node))
            continue;
          records.forEach((record) => released.add(record));
          return;
        }
      });
      this.#releaseRecords(released);
    }
    added.forEach((element) => {
      if (element.parentElement && added.has(element.parentElement))
        return;
      if (!watched.contains(element))
        return;
      this.#processTree(element, { deferCallbacks: false, wiredBy: watched });
    });
  }
  #releaseRecords(records) {
    if (records.size === 0)
      return;
    records.forEach((record) => this.#release(record));
    this.#pendingInitialCallbacks = this.#pendingInitialCallbacks.filter((record) => !records.has(record));
    this.#pendingListeners = this.#pendingListeners.filter((record) => !records.has(record));
    this.#frameCallbacks = this.#frameCallbacks.filter((record) => !records.has(record));
  }
  #release(record) {
    if (record.kind === "bind") {
      const bindings = this.#bindings.get(record.prop);
      bindings?.delete(record);
      if (bindings?.size === 0)
        this.#bindings.delete(record.prop);
    } else if (record.attached) {
      record.element.removeEventListener(record.type, record.listener);
    }
    const elementRecords = this.#recordsByElement.get(record.element);
    elementRecords?.delete(record);
    if (elementRecords?.size === 0)
      this.#recordsByElement.delete(record.element);
    if (!record.wiredBy)
      return;
    const wired = this.#recordsByWire.get(record.wiredBy);
    wired?.delete(record);
    if (wired?.size === 0)
      this.#recordsByWire.delete(record.wiredBy);
  }
  runQueuedInitialCallbacks() {
    const queuedCallbacks = this.#pendingInitialCallbacks;
    this.#pendingInitialCallbacks = [];
    queuedCallbacks.forEach((binding) => this.#pendingUpdates.delete(binding.prop));
    queuedCallbacks.forEach((binding) => this.#updateElement(binding));
    const queuedListeners = this.#pendingListeners;
    this.#pendingListeners = [];
    queuedListeners.forEach((record) => this.#attach(record));
  }
  #processTree(container, options) {
    const owner = this.instance.$el.contains(container) ? this.instance.$el : null;
    const isOwned = (element) => closestModelRoot(element) === owner;
    if (container instanceof HTMLElement && isOwned(container)) {
      this.#processElementBindings(container, options);
      if (container === this.instance.$el && container.hasAttribute("data-watch")) {
        this.#warn("data-watch on a model root watches the whole model; put it on the element whose contents change.");
      }
    }
    container.querySelectorAll("*").forEach((el) => {
      if (isOwned(el))
        this.#processElementBindings(el, options);
    });
  }
  registerComputed(key, computedStore) {
    this.#computed.set(key, computedStore);
  }
  getComputed(key) {
    return this.#computed.get(key)?.get();
  }
  hasComputed(key) {
    return this.#computed.has(key);
  }
  registerComputedFromModel(key, fn, dependencies, stateStore) {
    const computedStore = computed(stateStore, fn);
    this.registerComputed(key, computedStore);
    if (dependencies.length > 0) {
      const unsubscribe = stateStore.listen((_, __, changed) => {
        if (changed && dependencies.includes(changed)) {
          this.scheduleUpdate(key);
        }
      });
      this.#unsubscribers.add(unsubscribe);
      return () => {
        this.#unsubscribers.delete(unsubscribe);
        unsubscribe();
      };
    }
  }
  scheduleUpdate(key) {
    if (!this.#isBrowser)
      return;
    this.#pendingUpdates.add(key.toLowerCase());
    this.#scheduleFrame();
  }
  #scheduleFrame() {
    if (this.#updateScheduled)
      return;
    this.#updateScheduled = true;
    requestAnimationFrame(() => {
      const updated = new Map;
      const frameCallbacks = this.#frameCallbacks;
      this.#frameCallbacks = [];
      frameCallbacks.forEach((binding) => {
        if (this.#markUpdated(updated, binding))
          this.#updateElement(binding);
      });
      this.#pendingUpdates.forEach((prop) => this.#updateDependentElements(prop, updated));
      this.#pendingUpdates.clear();
      this.#updateScheduled = false;
    });
  }
  destroy() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers.clear();
    this.#recordsByElement.forEach((records) => records.forEach((record) => {
      if (record.kind === "on" && record.attached) {
        record.element.removeEventListener(record.type, record.listener);
      }
    }));
    this.#bindings.clear();
    this.#recordsByElement.clear();
    this.#recordsByWire.clear();
    this.#computed.clear();
    this.#pendingUpdates.clear();
    this.#pendingInitialCallbacks = [];
    this.#pendingListeners = [];
    this.#frameCallbacks = [];
  }
  #processElementBindings(element, options) {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name === "data-ref") {
        if (/\s/.test(attr.value.trim())) {
          this.#warn(`data-ref="${attr.value}" contains whitespace; a ref takes a single name.`);
        }
        return;
      }
      if (attr.name.startsWith("data-bind-")) {
        const propertyName = attr.name.substring("data-bind-".length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const key = propertyName.toLowerCase();
        const callbackName = attr.value;
        const record = this.#track({
          kind: "bind",
          prop: key,
          element,
          callback: callbackName,
          ...wiring(options)
        });
        if (!record)
          return;
        if (options.defaults && !Object.prototype.hasOwnProperty.call(options.defaults, propertyName)) {
          const isCheckable = element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio");
          const isMultiSelect = element instanceof HTMLSelectElement && element.multiple;
          options.defaults[propertyName] = {
            input: {
              value: element.value ?? undefined,
              checked: isCheckable ? element.checked : undefined,
              selectedValues: isMultiSelect ? Array.from(element.selectedOptions).map((option) => option.value) : undefined
            },
            text: element.textContent ?? "",
            html: element.innerHTML ?? ""
          };
        }
        const bindFn = Reflect.get(this.instance, callbackName);
        if (typeof bindFn !== "function") {
          this.#warn(`Binding callback "${callbackName}" not found for ${attr.name}.`);
          return;
        }
        if (options.deferCallbacks) {
          this.#pendingInitialCallbacks.push(record);
          return;
        }
        if (options.deferToFrame) {
          this.#frameCallbacks.push(record);
          this.#scheduleFrame();
          return;
        }
        try {
          bindFn.call(this.instance, element);
        } catch (error) {
          console.error(`Error in binding callback "${callbackName}" for property "${propertyName}":`, error);
        }
        return;
      }
      if (attr.name.startsWith("data-on-") && attr.name.length > "data-on-".length) {
        this.#bindListener(element, attr.name.substring("data-on-".length), attr.value, options);
      }
    });
  }
  #bindListener(element, type, method, options) {
    if (typeof Reflect.get(this.instance, method) !== "function") {
      this.#warn(`Event handler method "${method}" not found for data-on-${type}.`);
      return;
    }
    const listener = (event) => {
      try {
        Reflect.get(this.instance, method).call(this.instance, element, event);
      } catch (error) {
        console.error(`Error in event handler "${method}" for event "${type}":`, error);
      }
    };
    const record = this.#track({
      kind: "on",
      element,
      type,
      method,
      listener,
      attached: false,
      ...wiring(options)
    });
    if (!record)
      return;
    if (options.deferCallbacks)
      this.#pendingListeners.push(record);
    else
      this.#attach(record);
  }
  #attach(record) {
    record.element.addEventListener(record.type, record.listener);
    record.attached = true;
  }
  #track(record) {
    let elementRecords = this.#recordsByElement.get(record.element);
    if (!elementRecords) {
      elementRecords = new Set;
      this.#recordsByElement.set(record.element, elementRecords);
    }
    for (const existing of elementRecords) {
      if (SprinculCore.#sameRecord(existing, record))
        return null;
    }
    elementRecords.add(record);
    if (record.kind === "bind") {
      if (!this.#bindings.has(record.prop))
        this.#bindings.set(record.prop, new Set);
      this.#bindings.get(record.prop).add(record);
    }
    if (record.wiredBy) {
      let wired = this.#recordsByWire.get(record.wiredBy);
      if (!wired) {
        wired = new Set;
        this.#recordsByWire.set(record.wiredBy, wired);
      }
      wired.add(record);
    }
    return record;
  }
  static #sameRecord(a, b) {
    if (a.kind === "bind" && b.kind === "bind")
      return a.prop === b.prop && a.callback === b.callback;
    if (a.kind === "on" && b.kind === "on")
      return a.type === b.type && a.method === b.method;
    return false;
  }
  #updateDependentElements(prop, updated) {
    const dependentElements = this.#bindings.get(prop);
    if (!dependentElements)
      return;
    dependentElements.forEach((binding) => {
      if (updated && !this.#markUpdated(updated, binding))
        return;
      this.#updateElement(binding);
    });
  }
  #markUpdated(updated, binding) {
    let callbacks = updated.get(binding.element);
    if (!callbacks) {
      callbacks = new Set;
      updated.set(binding.element, callbacks);
    }
    if (callbacks.has(binding.callback))
      return false;
    callbacks.add(binding.callback);
    return true;
  }
  #updateElement(binding) {
    const fn = Reflect.get(this.instance, binding.callback);
    if (typeof fn === "function") {
      try {
        fn.call(this.instance, binding.element);
      } catch (error) {
        console.error(`Error in binding callback "${binding.callback}":`, error);
      }
    }
  }
  warn(message) {
    this.#warn(message);
  }
  #warn(message) {
    if (!this.devMode)
      return;
    console.warn(`[Sprincul] ${message}`);
  }
}

// src/SprinculModel.ts
var MALFORMED = Symbol("malformed");

class SprinculModel {
  static options;
  $el;
  #state;
  state;
  #core;
  constructor(element) {
    this.$el = element;
    this.#state = map({});
    this.#state.listen((_, __, changed) => {
      if (!changed)
        return;
      const core = this.#core || getCore(this);
      if (core) {
        core.scheduleUpdate(changed);
      }
    });
    this.state = SprinculCore.createStateProxy(this.#state, () => this.#core || getCore(this));
  }
  wire(element) {
    this.#requireCore("wire").processAddedElement(element);
  }
  unwire(element) {
    this.#requireCore("unwire").unwireElement(element);
  }
  #requireCore(method) {
    const core = this.#core || getCore(this);
    if (!core) {
      throw new Error(`[Sprincul] ${method}() called before core was available. Call it from beforeInit() or later instead.`);
    }
    return core;
  }
  $ref(name) {
    return this.$refs(name)[0] ?? null;
  }
  $refs(name) {
    if (!name)
      return [];
    const matches = Array.from(this.$el.querySelectorAll("[data-ref]")).filter((element) => element.getAttribute("data-ref").trim() === name && SprinculModel.#ownerOf(element) === this.$el);
    if (matches.length === 0 && this.$el.getAttribute("data-ref")?.trim() === name) {
      (this.#core || getCore(this))?.warn(`$ref("${name}") matches this model's own root, which is its parent model's ref, not its own.`);
    }
    return matches;
  }
  $child(name) {
    const element = this.$ref(name);
    return element ? getInstance(element) ?? null : null;
  }
  $parent() {
    const element = closestModelRoot(this.$el.parentElement);
    return element ? getInstance(element) ?? null : null;
  }
  $children(name) {
    return this.$refs(name).map((element) => getInstance(element)).filter((instance) => instance !== undefined);
  }
  $data(name, fallback) {
    const raw = this.$el.dataset[name];
    if (raw === undefined)
      return fallback;
    const value = SprinculModel.#parseData(raw, fallback);
    if (value !== MALFORMED)
      return value;
    const attribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    (this.#core || getCore(this))?.warn(`${attribute}="${raw}" on model "${this.$el.dataset.model}" can't be read like its fallback; using the fallback.`);
    return fallback;
  }
  static #parseData(raw, fallback) {
    switch (typeof fallback) {
      case "number": {
        const value = Number(raw);
        return raw.trim() === "" || Number.isNaN(value) ? MALFORMED : value;
      }
      case "boolean":
        if (raw === "" || raw === "true")
          return true;
        return raw === "false" ? false : MALFORMED;
      case "object": {
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          return MALFORMED;
        }
        if (fallback === null)
          return value;
        if (Array.isArray(fallback))
          return Array.isArray(value) ? value : MALFORMED;
        return value !== null && typeof value === "object" && !Array.isArray(value) ? value : MALFORMED;
      }
      default:
        return raw;
    }
  }
  static #ownerOf(element) {
    return closestModelRoot(isModelRoot(element) ? element.parentElement : element);
  }
  get $signal() {
    return getSignal(this);
  }
  $emit(type, detail, options) {
    if (`on${type}` in this.$el) {
      (this.#core || getCore(this))?.warn(`$emit("${type}") uses a native event name, so it mixes with the native events bubbling through the same elements.`);
    }
    if (/[A-Z]/.test(type)) {
      (this.#core || getCore(this))?.warn(`$emit("${type}") can't be heard by data-on-* because HTML lowercases attribute names; use a lowercase name such as "${type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}".`);
    }
    const event = new CustomEvent(type, { bubbles: true, ...options, detail });
    this.$el.dispatchEvent(event);
    return event;
  }
  $listen(...args) {
    const [target, type, handler, options] = typeof args[0] === "string" ? [this.$el, args[0], args[1]] : [args[0], args[1], args[2], args[3]];
    const signals = [this.$signal, options?.signal].filter((signal) => !!signal);
    const controller = new AbortController;
    const stop = () => {
      signals.forEach((signal) => signal.removeEventListener("abort", stop));
      controller.abort();
    };
    if (signals.some((signal) => signal.aborted))
      return stop;
    signals.forEach((signal) => signal.addEventListener("abort", stop, { once: true }));
    target.addEventListener(type, (event) => {
      if (options?.once)
        stop();
      handler.call(this, event);
    }, { ...options, signal: controller.signal });
    return stop;
  }
  addComputedProp(name, fn, dependencies = []) {
    if (dependencies.length === 0) {
      console.warn(`[Sprincul] addComputedProp("${name}") called without dependencies. Bound elements will not re-render when the value changes.`);
    }
    const core = this.#core || getCore(this);
    if (!core) {
      throw new Error(`[Sprincul] addComputedProp("${name}") called before core was available. Call it from beforeInit() or later instead.`);
    }
    const callback = () => Reflect.apply(fn, this, []);
    return core.registerComputedFromModel(name, callback, dependencies, this.#state) ?? (() => {});
  }
}

// src/Sprincul.ts
class Sprincul {
  static #registry = new Map;
  static #isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  static #globalStores = new Map;
  static #processedElements = new WeakSet;
  static #instancesByName = new Map;
  static #modelNames = new WeakMap;
  static #destroying = new WeakSet;
  static #teardowns = new WeakMap;
  static #deprecationsWarned = new Set;
  static #pendingBeforeInit = new WeakSet;
  static #customElements = new Map;
  static #pendingElements = new Set;
  static #flushScheduled = false;
  static #disconnectedElements = new Set;
  static #unmountScheduled = false;
  static #elementTeardowns = new WeakMap;
  static #options = { devMode: false };
  static store = {
    get(key) {
      const store = Sprincul.#globalStores.get(key);
      return store ? store.get() : undefined;
    },
    set(key, value) {
      if (!Sprincul.#globalStores.has(key)) {
        Sprincul.#globalStores.set(key, atom(value));
      }
      Sprincul.#globalStores.get(key).set(value);
    },
    subscribe(key, callback, options) {
      if (!Sprincul.#globalStores.has(key)) {
        Sprincul.#globalStores.set(key, atom());
      }
      const unsubscribe = Sprincul.#globalStores.get(key).listen(callback);
      const signal = options?.signal;
      let stopped = false;
      const stop = () => {
        if (stopped)
          return;
        stopped = true;
        signal?.removeEventListener("abort", stop);
        unsubscribe();
      };
      if (signal?.aborted) {
        stop();
      } else {
        signal?.addEventListener("abort", stop, { once: true });
      }
      return stop;
    },
    clear() {
      Sprincul.#globalStores.clear();
    }
  };
  static setOption(name, value) {
    if (!Object.prototype.hasOwnProperty.call(Sprincul.#options, name)) {
      console.warn(`[Sprincul] setOption() was given an unknown option "${String(name)}".`);
      return;
    }
    Sprincul.#options[name] = value;
  }
  static #option(name, modelClass, callValue) {
    return callValue ?? modelClass?.options?.[name] ?? Sprincul.#options[name];
  }
  static register(name, modelClass) {
    Sprincul.#registry.set(name, modelClass);
    Sprincul.#defineCustomElement(name, modelClass);
  }
  static registerAll(models) {
    for (const [name, cls] of Object.entries(models)) {
      if (typeof cls !== "function" || !(cls.prototype instanceof SprinculModel)) {
        console.warn(`[Sprincul] registerAll() skipped "${name}": it isn't a SprinculModel class.`);
        continue;
      }
      Sprincul.#registry.set(name, cls);
      Sprincul.#defineCustomElement(name, cls);
    }
  }
  static #defineCustomElement(modelName, modelClass) {
    const name = modelClass.options?.customElement;
    if (!name || typeof customElements === "undefined")
      return;
    if (customElements.get(name)) {
      if (Sprincul.#customElements.get(name) !== modelName) {
        console.warn(`[Sprincul] <${name}> is already defined, so "${modelName}" can't use it.`);
      }
      return;
    }

    class SprinculElement extends HTMLElement {
      get model() {
        return Sprincul.#option("devMode", modelClass) ? getInstance(this) : undefined;
      }
      connectedCallback() {
        Sprincul.#queueMount(this);
      }
      disconnectedCallback() {
        Sprincul.#queueUnmount(this);
      }
    }
    try {
      customElements.define(name, SprinculElement);
    } catch (e) {
      console.warn(`[Sprincul] Couldn't define <${name}> for "${modelName}":`, e);
      return;
    }
    Sprincul.#customElements.set(name, modelName);
    addModelTag(name);
  }
  static #isCustomElement(element) {
    return Sprincul.#customElements.has(element.localName);
  }
  static #queueMount(element) {
    Sprincul.#pendingElements.add(element);
    if (Sprincul.#flushScheduled)
      return;
    Sprincul.#flushScheduled = true;
    const flush = () => {
      Sprincul.#flushScheduled = false;
      Sprincul.#takePendingElements(document).sort(Sprincul.#childrenFirst).forEach((element) => Sprincul.#mountCustomElement(element));
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", flush, { once: true });
    } else {
      queueMicrotask(flush);
    }
  }
  static #queueUnmount(element) {
    Sprincul.#disconnectedElements.add(element);
    if (Sprincul.#unmountScheduled)
      return;
    Sprincul.#unmountScheduled = true;
    queueMicrotask(() => {
      Sprincul.#unmountScheduled = false;
      const queued = Sprincul.#disconnectedElements;
      Sprincul.#disconnectedElements = new Set;
      const removed = Array.from(queued).filter((element) => !element.isConnected);
      removed.forEach((element) => Sprincul.#pendingElements.delete(element));
      const roots = removed.filter((element) => {
        for (let parent = element.parentElement;parent; parent = parent.parentElement) {
          if (queued.has(parent))
            return false;
        }
        return true;
      });
      const models = roots.flatMap((root) => Sprincul.#modelsWithin(root));
      if (models.length === 0)
        return;
      const teardown = Sprincul.#destroyModels(models, false).finally(() => {
        removed.forEach((element) => {
          if (Sprincul.#elementTeardowns.get(element) === teardown)
            Sprincul.#elementTeardowns.delete(element);
        });
      });
      removed.forEach((element) => Sprincul.#elementTeardowns.set(element, teardown));
    });
  }
  static #takePendingElements(root) {
    const elements = Array.from(Sprincul.#pendingElements).filter((element) => root.contains(element));
    elements.forEach((element) => Sprincul.#pendingElements.delete(element));
    return elements.filter((element) => element.isConnected);
  }
  static #mountCustomElement(element) {
    if (getInstance(element))
      return null;
    const modelName = Sprincul.#customElements.get(element.localName);
    if (!modelName)
      return null;
    const teardown = Sprincul.#elementTeardowns.get(element);
    if (teardown) {
      teardown.then(() => {
        if (element.isConnected)
          Sprincul.#mountCustomElement(element);
      });
      return null;
    }
    try {
      const instance = Sprincul.mount(element, modelName);
      return { name: modelName, element, instance };
    } catch (e) {
      console.error(`[Sprincul] Failed to mount <${element.localName}>:`, e);
      return null;
    }
  }
  static init(options) {
    if (!Sprincul.#isBrowser) {
      console.warn("[Sprincul] init() called in non-browser environment. Skipping initialization.");
      return;
    }
    const root = options?.root ?? document.body;
    const modelElements = Array.from(root.querySelectorAll("[data-model]")).filter((element) => !Sprincul.#isCustomElement(element));
    if (root instanceof HTMLElement && root.hasAttribute("data-model") && !Sprincul.#isCustomElement(root)) {
      modelElements.unshift(root);
    }
    if (document.readyState !== "loading")
      modelElements.push(...Sprincul.#takePendingElements(root));
    modelElements.sort(Sprincul.#childrenFirst);
    const modelInfos = [];
    modelElements.forEach((element) => {
      if (Sprincul.#isCustomElement(element)) {
        const info = Sprincul.#mountCustomElement(element);
        if (info)
          modelInfos.push(info);
        return;
      }
      try {
        const info = Sprincul.processModelElement(element, options?.devMode);
        if (info)
          modelInfos.push(info);
      } catch (e) {
        console.error(`[Sprincul] Failed to process model element:`, e);
      }
    });
    root.querySelectorAll("[data-cloaked]:not([data-model])").forEach((element) => {
      element.removeAttribute("data-cloaked");
    });
    if (options?.onReady) {
      const publicModels = modelInfos.map((info) => Sprincul.#option("devMode", Sprincul.#registry.get(info.name), Sprincul.#isCustomElement(info.element) ? undefined : options.devMode) ? info : { name: info.name, element: info.element });
      try {
        options.onReady(publicModels);
      } catch (error) {
        console.error("Error in onReady callback:", error);
      }
    }
  }
  static processModelElement(element, devModeOption) {
    const modelName = element.dataset.model;
    if (!modelName) {
      console.warn('[Sprincul] Element is missing a "data-model" attribute. Skipping.');
      return null;
    }
    const ModelClass = this.#registry.get(modelName);
    if (!ModelClass) {
      console.warn(`[Sprincul] The model "${modelName}" is not registered. Skipping.`);
      return null;
    }
    const devMode = Sprincul.#option("devMode", ModelClass, devModeOption);
    if (Sprincul.#processedElements.has(element)) {
      if (devMode && Sprincul.#tearingDown(element)) {
        console.warn(`[Sprincul] Skipped "${modelName}": the model on this element is still running an async beforeDestroy(). Await unmount() before mounting it again.`);
      }
      return null;
    }
    Sprincul.#processedElements.add(element);
    let model;
    let core;
    let defaults;
    try {
      model = new ModelClass(element);
      core = new SprinculCore(model, devMode);
      setCore(model, core);
      Sprincul.#trackModelInstance(modelName, model);
      defaults = core.setupBindings(element);
      Sprincul.#watchDocument(element.ownerDocument);
    } catch (e) {
      Sprincul.#processedElements.delete(element);
      if (model) {
        deleteCore(model);
        Sprincul.#untrackModelInstance(model);
      }
      throw e;
    }
    let beforeInitResult;
    try {
      beforeInitResult = Sprincul.#runHook(model, "beforeInit", true, [defaults]);
    } catch (e) {
      console.error('Error in "beforeInit" hook call:', e);
    }
    if (beforeInitResult instanceof Promise) {
      Sprincul.#pendingBeforeInit.add(model);
      beforeInitResult.catch((e) => console.error('Error in "beforeInit" hook call:', e)).finally(() => {
        Sprincul.#pendingBeforeInit.delete(model);
        if (Sprincul.#destroying.has(model))
          return;
        core.runQueuedInitialCallbacks();
        Sprincul.#runAfterInit(model, element);
      });
    } else {
      if (Sprincul.#destroying.has(model))
        return null;
      core.runQueuedInitialCallbacks();
      Sprincul.#runAfterInit(model, element);
    }
    return { name: modelName, element, instance: model };
  }
  static #runAfterInit(model, element) {
    let afterHook;
    try {
      afterHook = Sprincul.#runHook(model, "afterInit", true);
    } catch (e) {
      console.error('Error in "afterInit" hook call:', e);
    }
    Promise.resolve(afterHook).catch((e) => console.error('Error in "afterInit" hook call:', e)).finally(() => {
      if (element.hasAttribute("data-cloaked")) {
        element.removeAttribute("data-cloaked");
      }
    });
  }
  static mount(element, modelClassOrName, options) {
    let modelName;
    if (typeof modelClassOrName === "string") {
      const resolved = Sprincul.#registry.get(modelClassOrName);
      if (!resolved) {
        throw new Error(`Model "${modelClassOrName}" is not registered.`);
      }
      modelName = modelClassOrName;
    } else {
      const existing = Array.from(Sprincul.#registry.entries()).find(([, cls]) => cls === modelClassOrName);
      if (existing) {
        modelName = existing[0];
      } else {
        modelName = modelClassOrName.name || "AnonymousModel";
        let uniqueName = modelName;
        let counter = 1;
        while (Sprincul.#registry.has(uniqueName)) {
          uniqueName = `${modelName}_${counter++}`;
        }
        modelName = uniqueName;
        Sprincul.register(modelName, modelClassOrName);
      }
    }
    const previousModelName = element.dataset.model;
    element.dataset.model = modelName;
    let info;
    try {
      info = Sprincul.processModelElement(element, options?.devMode);
    } catch (e) {
      Sprincul.#restoreModelName(element, previousModelName);
      throw e;
    }
    if (!info || !info.instance) {
      Sprincul.#restoreModelName(element, previousModelName);
      throw new Error(`Failed to mount model on element. It may already be processed. Call unmount() first.`);
    }
    if (options?.onReady) {
      const publicInfo = Sprincul.#option("devMode", Sprincul.#registry.get(modelName), options.devMode) ? info : { name: info.name, element: info.element };
      try {
        options.onReady(publicInfo);
      } catch (error) {
        console.error("Error in onReady callback:", error);
      }
    }
    return info.instance;
  }
  static unmount(element, modelName) {
    if (modelName !== undefined) {
      Sprincul.#warnDeprecated("unmount(element, modelName)", "unmount(element)");
      return Sprincul.#destroyOne(modelName, element);
    }
    return Sprincul.#destroyModels(Sprincul.#modelsWithin(element), true);
  }
  static #modelsWithin(element) {
    const elements = [element, ...Array.from(element.querySelectorAll("[data-model]"))];
    return elements.map((candidate) => getInstance(candidate)).filter((model) => model !== undefined);
  }
  static destroy(modelName, element) {
    if (element) {
      Sprincul.#warnDeprecated("destroy(modelName, element)", "unmount(element)");
      return Sprincul.#destroyOne(modelName, element);
    }
    return Sprincul.#destroyModels(Array.from(Sprincul.#instancesByName.get(modelName) ?? []), false);
  }
  static #destroyOne(modelName, element) {
    const target = Array.from(Sprincul.#instancesByName.get(modelName) ?? []).find((instance) => instance.$el === element);
    if (target)
      return Sprincul.#destroyInOrder([target]);
    if (element.dataset.model && element.dataset.model !== modelName) {
      console.warn(`[Sprincul] destroy("${modelName}") found no instance on an element mounted as "${element.dataset.model}".`);
    }
    return Promise.resolve();
  }
  static #warnDeprecated(form, replacement) {
    if (Sprincul.#deprecationsWarned.has(form))
      return;
    Sprincul.#deprecationsWarned.add(form);
    console.warn(`[Sprincul] ${form} is deprecated and will be removed in a future release; use ${replacement}.`);
  }
  static destroyAll() {
    const models = [];
    Sprincul.#instancesByName.forEach((instances) => models.push(...instances));
    return Sprincul.#destroyModels(models, false);
  }
  static #destroyModels(models, inDocumentOrder) {
    if (!models.some((model) => typeof model.beforeDestroy === "function")) {
      return Promise.all(models.map((model) => Sprincul.#destroyInstance(model))).then(() => {
        return;
      });
    }
    if (!inDocumentOrder)
      models.sort((a, b) => Sprincul.#documentOrder(a.$el, b.$el));
    return Sprincul.#destroyInOrder(models);
  }
  static #destroyInOrder(models) {
    const pending = new Map;
    models.forEach((model) => {
      const ancestors = [];
      for (let ancestor = model.$el.parentElement?.closest("[data-model]");ancestor; ancestor = ancestor.parentElement?.closest("[data-model]")) {
        const teardown = pending.get(ancestor);
        if (teardown)
          ancestors.push(teardown);
      }
      const teardown = ancestors.length === 0 ? Sprincul.#destroyInstance(model) : Promise.all(ancestors).then(() => Sprincul.#destroyInstance(model));
      if (teardown)
        pending.set(model.$el, teardown);
    });
    return Promise.all(pending.values()).then(() => {
      return;
    });
  }
  static #tearingDown(element) {
    const models = [];
    Sprincul.#instancesByName.forEach((instances) => models.push(...instances));
    return models.some((model) => model.$el === element && Sprincul.#teardowns.has(model));
  }
  static #childrenFirst(a, b) {
    if (a.contains(b))
      return 1;
    if (b.contains(a))
      return -1;
    return Sprincul.#documentOrder(a, b);
  }
  static #documentOrder(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }
  static #destroyInstance(model) {
    if (Sprincul.#destroying.has(model))
      return Sprincul.#teardowns.get(model);
    Sprincul.#destroying.add(model);
    deleteInstance(model);
    let beforeDestroyResult;
    try {
      beforeDestroyResult = Sprincul.#runHook(model, "beforeDestroy", true);
    } catch (e) {
      console.error('Error in "beforeDestroy" hook call:', e);
    }
    if (!(beforeDestroyResult instanceof Promise)) {
      Sprincul.#finishDestroy(model);
      return;
    }
    const teardown = beforeDestroyResult.catch((e) => console.error('Error in "beforeDestroy" hook call:', e)).then(() => {
      Sprincul.#teardowns.delete(model);
      Sprincul.#finishDestroy(model);
    });
    Sprincul.#teardowns.set(model, teardown);
    return teardown;
  }
  static #finishDestroy(model) {
    try {
      abortSignal(model);
      getCore(model)?.destroy();
    } catch (e) {
      console.error("[Sprincul] Error while tearing down a model:", e);
    } finally {
      deleteCore(model);
      Sprincul.#processedElements.delete(model.$el);
      Sprincul.#untrackModelInstance(model);
    }
  }
  static #watchObservers = new WeakMap;
  static #watchDocument(document2) {
    const view = document2.defaultView;
    if (!view || Sprincul.#watchObservers.has(document2))
      return;
    const observer = new view.MutationObserver((records) => Sprincul.#applyWatched(records));
    observer.observe(document2, { childList: true, subtree: true });
    Sprincul.#watchObservers.set(document2, observer);
  }
  static #applyWatched(records) {
    const changes = new Map;
    const isElement = (node) => node.nodeType === 1;
    for (const record of records) {
      const target = record.target;
      const watched = target.nodeType === 1 ? target.closest("[data-watch]") : null;
      if (!watched)
        continue;
      const added = Array.from(record.addedNodes).filter(isElement);
      const removed = Array.from(record.removedNodes).filter(isElement);
      if (added.length === 0 && removed.length === 0)
        continue;
      if (closestModelRoot(target) !== closestModelRoot(watched))
        continue;
      let change = changes.get(watched);
      if (!change) {
        change = { added: new Set, removed: new Set };
        changes.set(watched, change);
      }
      added.forEach((node) => change.added.add(node));
      removed.forEach((node) => change.removed.add(node));
    }
    changes.forEach(({ added, removed }, watched) => {
      const root = closestModelRoot(watched);
      const model = root ? getInstance(root) : undefined;
      const core = model ? getCore(model) : undefined;
      core?.applyWatchedChanges(watched, added, removed);
    });
  }
  static #restoreModelName(element, previousModelName) {
    if (previousModelName === undefined) {
      delete element.dataset.model;
      return;
    }
    element.dataset.model = previousModelName;
  }
  static #trackModelInstance(modelName, model) {
    if (!Sprincul.#instancesByName.has(modelName)) {
      Sprincul.#instancesByName.set(modelName, new Set);
    }
    Sprincul.#instancesByName.get(modelName).add(model);
    Sprincul.#modelNames.set(model, modelName);
    setInstance(model.$el, model);
  }
  static #untrackModelInstance(model) {
    deleteInstance(model);
    const modelName = Sprincul.#modelNames.get(model);
    if (!modelName)
      return;
    const instances = Sprincul.#instancesByName.get(modelName);
    if (!instances)
      return;
    instances.delete(model);
    if (instances.size === 0) {
      Sprincul.#instancesByName.delete(modelName);
    }
  }
  static #runHook(instance, methodName, sync = false, args = []) {
    const hook = Reflect.get(instance, methodName);
    if (typeof hook !== "function")
      return;
    if (sync)
      return hook.call(instance, ...args);
    return Promise.resolve().then(() => hook.call(instance, ...args));
  }
}
export {
  Sprincul,
  SprinculModel
};

//# debugId=D92C1B9726500DE064756E2164756E21
