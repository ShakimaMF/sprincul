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
// src/SprinculCore.ts
class SprinculCore {
  instance;
  devMode;
  #bindings = new Map;
  #bindingsByElement = new Map;
  #computed = new Map;
  #domListeners = new Set;
  #unsubscribers = new Set;
  #pendingUpdates = new Set;
  #updateScheduled = false;
  #pendingInitialCallbacks = [];
  #pendingListeners = [];
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
    return defaults;
  }
  processAddedElement(element) {
    this.#processTree(element, { deferCallbacks: false, viaWire: true });
  }
  unwireElement(element) {
    const isInScope = (candidate) => element.contains(candidate);
    Array.from(this.#bindingsByElement.keys()).forEach((node) => {
      if (!isInScope(node))
        return;
      const elementBindings = this.#bindingsByElement.get(node);
      elementBindings.forEach((record) => {
        if (!record.viaWire)
          return;
        const bindings = this.#bindings.get(record.prop);
        if (bindings) {
          bindings.delete(record);
          if (bindings.size === 0)
            this.#bindings.delete(record.prop);
        }
        elementBindings.delete(record);
      });
      if (elementBindings.size === 0)
        this.#bindingsByElement.delete(node);
    });
    this.#domListeners.forEach((record) => {
      if (!isInScope(record.element))
        return;
      record.element.removeEventListener(record.type, record.listener, record.options);
      this.#domListeners.delete(record);
    });
    this.#pendingInitialCallbacks = this.#pendingInitialCallbacks.filter((binding) => !isInScope(binding.element));
    this.#pendingListeners = this.#pendingListeners.filter((listener) => !isInScope(listener.element));
  }
  runQueuedInitialCallbacks() {
    const queuedCallbacks = this.#pendingInitialCallbacks;
    this.#pendingInitialCallbacks = [];
    queuedCallbacks.forEach((binding) => this.#pendingUpdates.delete(binding.prop));
    queuedCallbacks.forEach((binding) => this.#updateElement(binding));
    const queuedListeners = this.#pendingListeners;
    this.#pendingListeners = [];
    queuedListeners.forEach(({ element, eventName, methodName }) => this.#attachListener(element, eventName, methodName));
  }
  #processTree(container, options) {
    const isNestedModelRoot = container.hasAttribute("data-model") && container !== this.instance.$el;
    const closestModelElement = container.closest("[data-model]");
    const withinThisModel = container === this.instance.$el || closestModelElement === this.instance.$el;
    if (!isNestedModelRoot && withinThisModel) {
      this.#processElementBindings(container, options);
    }
    container.querySelectorAll("*").forEach((el) => {
      const element = el;
      const closest = element.closest("[data-model]");
      if (element.hasAttribute("data-model") && element !== container)
        return;
      if (closest !== this.instance.$el)
        return;
      this.#processElementBindings(element, options);
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
    this.#pendingUpdates.add(key);
    if (!this.#updateScheduled) {
      this.#updateScheduled = true;
      requestAnimationFrame(() => {
        const updated = new Map;
        this.#pendingUpdates.forEach((prop) => this.#updateDependentElements(prop, updated));
        this.#pendingUpdates.clear();
        this.#updateScheduled = false;
      });
    }
  }
  destroy() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers.clear();
    this.#domListeners.forEach(({ element, type, listener, options }) => {
      element.removeEventListener(type, listener, options);
    });
    this.#domListeners.clear();
    this.#bindings.clear();
    this.#bindingsByElement.clear();
    this.#computed.clear();
    this.#pendingUpdates.clear();
    this.#pendingInitialCallbacks = [];
    this.#pendingListeners = [];
  }
  #processElementBindings(element, options) {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-bind-")) {
        const propertyName = attr.name.substring("data-bind-".length);
        const callbackName = attr.value;
        const alreadyBound = this.#trackBinding(propertyName, element, callbackName, options.viaWire === true);
        if (alreadyBound)
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
          this.#warn(`Binding callback "${callbackName}" not found for data-bind-${propertyName}.`);
          return;
        }
        if (options.deferCallbacks) {
          this.#pendingInitialCallbacks.push({
            prop: propertyName,
            element,
            callback: callbackName,
            viaWire: options.viaWire === true
          });
          return;
        }
        try {
          bindFn.call(this.instance, element);
        } catch (error) {
          console.error(`Error in binding callback "${callbackName}" for property "${propertyName}":`, error);
        }
        return;
      }
      if (this.#isEventAttribute(element, attr.name)) {
        const eventName = attr.name.substring(2);
        const methodName = attr.value;
        element.removeAttribute(attr.name);
        if (options.deferCallbacks) {
          this.#pendingListeners.push({ element, eventName, methodName });
          return;
        }
        this.#attachListener(element, eventName, methodName);
      }
    });
  }
  #isEventAttribute(element, attributeName) {
    if (!attributeName.startsWith("on") || attributeName.length <= 2)
      return false;
    return attributeName in element || this.#isBrowser && attributeName in window;
  }
  #attachListener(element, eventName, methodName) {
    const eventFn = Reflect.get(this.instance, methodName);
    if (typeof eventFn !== "function") {
      this.#warn(`Event handler method "${methodName}" not found for on${eventName}.`);
      return;
    }
    const listener = (e) => {
      try {
        eventFn.call(this.instance, e);
      } catch (error) {
        console.error(`Error in event handler "${methodName}" for event "${eventName}":`, error);
      }
    };
    element.addEventListener(eventName, listener);
    this.#domListeners.add({ element, type: eventName, listener });
  }
  #trackBinding(prop, element, callback, viaWire) {
    let elementBindings = this.#bindingsByElement.get(element);
    if (!elementBindings) {
      elementBindings = new Set;
      this.#bindingsByElement.set(element, elementBindings);
    }
    for (const existing of elementBindings) {
      if (existing.prop === prop && existing.callback === callback)
        return true;
    }
    if (!this.#bindings.has(prop)) {
      this.#bindings.set(prop, new Set);
    }
    const record = { prop, element, callback, viaWire };
    this.#bindings.get(prop).add(record);
    elementBindings.add(record);
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
  #warn(message) {
    if (!this.devMode)
      return;
    console.warn(`[Sprincul] ${message}`);
  }
}

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

// src/Sprincul.ts
class Sprincul {
  static #registry = new Map;
  static #isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  static #globalStores = new Map;
  static #processedElements = new WeakSet;
  static #instancesByName = new Map;
  static #modelNames = new WeakMap;
  static #destroying = new WeakSet;
  static #pendingBeforeInit = new WeakSet;
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
    subscribe(key, callback) {
      if (!Sprincul.#globalStores.has(key)) {
        Sprincul.#globalStores.set(key, atom());
      }
      return Sprincul.#globalStores.get(key).listen(callback);
    },
    clear() {
      Sprincul.#globalStores.clear();
    }
  };
  static register(name, modelClass) {
    Sprincul.#registry.set(name, modelClass);
  }
  static registerAll(models) {
    for (const [name, cls] of Object.entries(models)) {
      Sprincul.#registry.set(name, cls);
    }
  }
  static init(options) {
    if (!Sprincul.#isBrowser) {
      console.warn("[Sprincul] init() called in non-browser environment. Skipping initialization.");
      return;
    }
    const devMode = options?.devMode ?? false;
    const root = options?.root ?? document.body;
    const modelElements = Array.from(root.querySelectorAll("[data-model]"));
    if (root.hasAttribute("data-model"))
      modelElements.unshift(root);
    const modelInfos = [];
    modelElements.forEach((element) => {
      try {
        const info = Sprincul.processModelElement(element, devMode);
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
      const publicModels = devMode ? modelInfos : modelInfos.map(({ name, element }) => ({ name, element }));
      try {
        options.onReady(publicModels);
      } catch (error) {
        console.error("Error in onReady callback:", error);
      }
    }
  }
  static processModelElement(element, devMode = false) {
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
    if (Sprincul.#processedElements.has(element))
      return null;
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
    const devMode = options?.devMode ?? false;
    let info;
    try {
      info = Sprincul.processModelElement(element, devMode);
    } catch (e) {
      Sprincul.#restoreModelName(element, previousModelName);
      throw e;
    }
    if (!info || !info.instance) {
      Sprincul.#restoreModelName(element, previousModelName);
      throw new Error(`Failed to mount model on element. It may already be processed. Call unmount() first.`);
    }
    if (options?.onReady) {
      const publicInfo = devMode ? info : { name: info.name, element: info.element };
      try {
        options.onReady(publicInfo);
      } catch (error) {
        console.error("Error in onReady callback:", error);
      }
    }
    return info.instance;
  }
  static unmount(element, modelName) {
    const name = modelName || element.dataset.model;
    if (!name) {
      console.warn("[Sprincul] unmount() called on element without a model.");
      return;
    }
    Sprincul.destroy(name, element);
  }
  static destroy(modelName, element) {
    const instances = Sprincul.#instancesByName.get(modelName);
    if (element) {
      const target = Array.from(instances ?? []).find((instance) => instance.$el === element);
      if (target) {
        Sprincul.#destroyInstance(target);
        return;
      }
      if (element.dataset.model && element.dataset.model !== modelName) {
        console.warn(`[Sprincul] destroy("${modelName}") found no instance on an element mounted as "${element.dataset.model}".`);
      }
      return;
    }
    if (!instances || instances.size === 0)
      return;
    Array.from(instances).forEach((instance) => {
      Sprincul.#destroyInstance(instance);
    });
  }
  static destroyAll() {
    Array.from(Sprincul.#instancesByName.keys()).forEach((modelName) => {
      Sprincul.destroy(modelName);
    });
  }
  static #destroyInstance(model) {
    if (Sprincul.#destroying.has(model))
      return;
    Sprincul.#destroying.add(model);
    let beforeDestroyResult;
    try {
      beforeDestroyResult = Sprincul.#runHook(model, "beforeDestroy", true);
    } catch (e) {
      console.error('Error in "beforeDestroy" hook call:', e);
    }
    if (beforeDestroyResult instanceof Promise) {
      beforeDestroyResult.catch((e) => console.error('Error in "beforeDestroy" hook call:', e)).finally(() => Sprincul.#finishDestroy(model));
    } else {
      Sprincul.#finishDestroy(model);
    }
  }
  static #finishDestroy(model) {
    const core = getCore(model);
    if (core) {
      try {
        core.destroy();
      } finally {
        deleteCore(model);
      }
    }
    Sprincul.#processedElements.delete(model.$el);
    Sprincul.#untrackModelInstance(model);
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
  }
  static #untrackModelInstance(model) {
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

// src/SprinculModel.ts
class SprinculModel {
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
    const core = this.#core || getCore(this);
    if (!core) {
      throw new Error(`[Sprincul] wire() called before core was available. Call it from beforeInit() or later instead.`);
    }
    core.processAddedElement(element);
  }
  unwire(element) {
    const core = this.#core || getCore(this);
    if (!core) {
      throw new Error(`[Sprincul] unwire() called before core was available. Call it from beforeInit() or later instead.`);
    }
    core.unwireElement(element);
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
export {
  Sprincul,
  SprinculModel
};

//# debugId=C3FCCF92D84FFB1F64756E2164756E21
