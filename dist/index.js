// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/clean-stores/index.js
var clean = Symbol("clean");

// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/atom/index.js
var listenerQueue = [];
var lqIndex = 0;
var QUEUE_ITEMS_PER_LISTENER = 4;
var epoch = 0;
var atom = (initialValue) => {
  let listeners = [];
  let $atom = {
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
        for (let i = lqIndex + QUEUE_ITEMS_PER_LISTENER;i < listenerQueue.length; ) {
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
      epoch++;
      let runListenerQueue = !listenerQueue.length;
      for (let listener of listeners) {
        listenerQueue.push(listener, $atom.value, oldValue, changedKey);
      }
      if (runListenerQueue) {
        for (lqIndex = 0;lqIndex < listenerQueue.length; lqIndex += QUEUE_ITEMS_PER_LISTENER) {
          listenerQueue[lqIndex](listenerQueue[lqIndex + 1], listenerQueue[lqIndex + 2], listenerQueue[lqIndex + 3]);
        }
        listenerQueue.length = 0;
      }
    },
    off() {},
    set(newValue) {
      let oldValue = $atom.value;
      if (oldValue !== newValue) {
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
// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/lifecycle/index.js
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
    currentListeners.splice(index, 1);
    if (!currentListeners.length) {
      delete object.events[eventKey];
      object.events[eventKey + REVERT_MUTATION]();
      delete object.events[eventKey + REVERT_MUTATION];
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

// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/warn/index.js
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

// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/computed/index.js
var computedStore = (stores, cb, batched) => {
  if (!Array.isArray(stores))
    stores = [stores];
  let previousArgs;
  let currentEpoch;
  let set = () => {
    if (currentEpoch === epoch)
      return;
    currentEpoch = epoch;
    let args = stores.map(($store) => $store.get());
    if (!previousArgs || args.some((arg, i) => arg !== previousArgs[i])) {
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
        currentEpoch = epoch;
      }
    }
  };
  let $computed = atom(undefined);
  let get = $computed.get;
  $computed.get = () => {
    set();
    return get();
  };
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
// node_modules/.bun/nanostores@1.2.0/node_modules/nanostores/map/index.js
var map = (initial = {}) => {
  let $map = atom(initial);
  $map.setKey = function(key, value) {
    let oldMap = $map.value;
    if (typeof value === "undefined" && key in $map.value) {
      $map.value = { ...$map.value };
      delete $map.value[key];
      $map.notify(oldMap, key);
    } else if ($map.value[key] !== value) {
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
  static createStateProxy(stateStore, getCoreRef) {
    return new Proxy({}, {
      get: (_, prop) => {
        const core = getCoreRef();
        if (core?.hasComputed(prop)) {
          return core?.getComputed(prop);
        }
        return stateStore.get()[prop];
      },
      set: (_, prop, value) => {
        stateStore.setKey(prop, value);
        return true;
      }
    });
  }
  #bindings = new Map;
  #computed = new Map;
  #mutationObserver;
  #pendingUpdates = new Set;
  #updateScheduled = false;
  #unsubscribers = new Set;
  #isBrowser;
  constructor(instance, devMode = false) {
    this.instance = instance;
    this.devMode = devMode;
    this.#isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  }
  setupBindings(container) {
    this.#processElementBindings(container);
    container.querySelectorAll("*").forEach((el) => {
      const element = el;
      const closestModelElement = element.closest("[data-model]");
      if (element.hasAttribute("data-model") && element !== container)
        return;
      if (closestModelElement !== this.instance.$el)
        return;
      this.#processElementBindings(element);
    });
    if (this.#isBrowser) {
      this.#mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.removedNodes) {
            if (!(node instanceof HTMLElement))
              continue;
            this.#purgeElement(node);
            node.querySelectorAll("*").forEach((child) => {
              if (child instanceof HTMLElement)
                this.#purgeElement(child);
            });
          }
        }
      });
      this.#mutationObserver?.observe(this.instance.$el, { childList: true, subtree: true });
    }
  }
  registerComputed(key, computedStore2) {
    this.#computed.set(key, computedStore2);
  }
  getComputed(key) {
    return this.#computed.get(key)?.get();
  }
  hasComputed(key) {
    return this.#computed.has(key);
  }
  registerComputedFromModel(key, fn, dependencies, stateStore) {
    const computedStore2 = computed(stateStore, fn);
    this.registerComputed(key, computedStore2);
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
        this.#pendingUpdates.forEach((prop) => this.#updateDependentElements(prop));
        this.#pendingUpdates.clear();
        this.#updateScheduled = false;
      });
    }
  }
  destroy() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers.clear();
    this.#mutationObserver?.disconnect();
    this.#bindings.clear();
    this.#computed.clear();
    this.#pendingUpdates.clear();
  }
  #processElementBindings(element) {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-bind-")) {
        const propertyName = attr.name.substring("data-bind-".length);
        const callbackName = attr.value;
        this.#trackBinding(propertyName, element, callbackName);
        const bindFn = Reflect.get(this.instance, callbackName);
        if (typeof bindFn === "function") {
          try {
            bindFn.call(this.instance, element);
          } catch (error) {
            console.error(`Error in binding callback "${callbackName}" for property "${propertyName}":`, error);
          }
        } else {
          this.#warn(`Binding callback "${callbackName}" not found for data-bind-${propertyName}.`);
        }
      } else if (attr.name.startsWith("on") && attr.name.length > 2) {
        const eventName = attr.name.substring(2);
        const methodName = attr.value;
        const eventFn = Reflect.get(this.instance, methodName);
        if (typeof eventFn === "function") {
          element.addEventListener(eventName, (e) => {
            try {
              eventFn.call(this.instance, e);
            } catch (error) {
              console.error(`Error in event handler "${methodName}" for event "${eventName}":`, error);
            }
          });
          element.removeAttribute(attr.name);
        } else {
          this.#warn(`Event handler method "${methodName}" not found for ${attr.name}.`);
        }
      }
    });
  }
  #trackBinding(prop, element, callback) {
    if (!this.#bindings.has(prop)) {
      this.#bindings.set(prop, new Set);
    }
    this.#bindings.get(prop).add({ element, callback });
  }
  #purgeElement(element) {
    this.#bindings.forEach((bindings) => {
      bindings.forEach((binding) => {
        if (binding.element === element)
          bindings.delete(binding);
      });
    });
  }
  #updateDependentElements(prop) {
    const dependentElements = this.#bindings.get(prop);
    if (!dependentElements)
      return;
    dependentElements.forEach((binding) => {
      this.#updateElement(binding);
    });
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
var FLUSH_PENDING = Symbol("flushPending");
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
  static #devMode = false;
  static #isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  static #globalStores = new Map;
  static #processedElements = new WeakSet;
  static #readyCallbacks = [];
  static #initialized = false;
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
    for (const name in models) {
      Sprincul.#registry.set(name, models[name]);
    }
  }
  static onReady(callback) {
    if (!Sprincul.#isBrowser) {
      Sprincul.#warn("onReady() called in non-browser environment.");
      return;
    }
    if (Sprincul.#initialized) {
      Sprincul.#warn("onReady() called after Sprincul.init() has completed. Callback will not be invoked. Register callbacks before calling init().");
      return;
    }
    Sprincul.#readyCallbacks.push(callback);
  }
  static init(options) {
    if (!Sprincul.#isBrowser) {
      Sprincul.#warn("init() called in non-browser environment. Skipping initialization.");
      return;
    }
    Sprincul.#devMode = options?.devMode ?? false;
    const modelElements = Array.from(document.querySelectorAll("[data-model]"));
    const modelInfos = [];
    modelElements.forEach((element) => {
      const info = Sprincul.processModelElement(element);
      if (info) {
        modelInfos.push(info);
      }
    });
    document.querySelectorAll("[data-cloaked]:not([data-model])").forEach((element) => {
      element.removeAttribute("data-cloaked");
    });
    Sprincul.#dispatchReadyEvents(modelInfos);
  }
  static processModelElement(element) {
    const modelName = element.dataset.model;
    if (!modelName) {
      throw new Error('Element is missing a "data-model" attribute');
    }
    const ModelClass = this.#registry.get(modelName);
    if (!ModelClass) {
      throw new Error(`The model, "${modelName}" is not registered for use.`);
    }
    if (Sprincul.#processedElements.has(element))
      return null;
    Sprincul.#processedElements.add(element);
    const model = new ModelClass(element);
    const core = new SprinculCore(model, Sprincul.#devMode);
    setCore(model, core);
    if (typeof model[FLUSH_PENDING] === "function") {
      model[FLUSH_PENDING]();
    }
    core.setupBindings(element);
    Sprincul.#runHook(model, "afterInit").catch((e) => console.error('Error in "afterInit" hook call:', e)).finally(() => {
      if (element.hasAttribute("data-cloaked")) {
        element.removeAttribute("data-cloaked");
      }
    });
    const modelInfo = { name: modelName, element };
    if (Sprincul.#devMode) {
      modelInfo.instance = model;
    }
    return modelInfo;
  }
  static destroy(model) {
    const core = getCore(model);
    if (core) {
      core.destroy();
      deleteCore(model);
    }
  }
  static #runHook(instance, methodName) {
    const hook = Reflect.get(instance, methodName);
    if (typeof hook !== "function") {
      return Promise.resolve(undefined);
    }
    return Promise.resolve().then(() => hook.call(instance));
  }
  static #dispatchReadyEvents(models) {
    const readyEvent = new CustomEvent("sprincul:ready", {
      bubbles: true,
      detail: { models }
    });
    document.dispatchEvent(readyEvent);
    Sprincul.#readyCallbacks.forEach((callback) => {
      try {
        callback(models);
      } catch (error) {
        console.error("Error in onReady callback:", error);
      }
    });
    Sprincul.#readyCallbacks = [];
    Sprincul.#initialized = true;
  }
  static #warn(message) {
    if (!Sprincul.#devMode)
      return;
    console.warn(`[Sprincul] ${message}`);
  }
}

// src/SprinculModel.ts
class SprinculModel {
  $el;
  #state;
  state;
  #core;
  #pendingComputed = [];
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
  addComputedProp(name, fn, dependencies = []) {
    if (dependencies.length === 0) {
      console.warn(`[Sprincul] addComputedProp("${name}") called without dependencies. Bound elements will not re-render when the value changes.`);
    }
    const core = this.#core || getCore(this);
    if (!core) {
      this.#pendingComputed.push({ key: name, fn, dependencies });
      return;
    }
    return core.registerComputedFromModel(name, () => Reflect.apply(fn, this, []), dependencies, this.#state);
  }
  [FLUSH_PENDING]() {
    const core = getCore(this);
    if (!core)
      return;
    this.#core = core;
    this.#pendingComputed.forEach(({ key, fn, dependencies }) => {
      core.registerComputedFromModel(key, () => Reflect.apply(fn, this, []), dependencies, this.#state);
    });
    this.#pendingComputed = [];
  }
}
export {
  SprinculModel,
  Sprincul
};

//# debugId=9CFB76111E4F807064756E2164756E21
