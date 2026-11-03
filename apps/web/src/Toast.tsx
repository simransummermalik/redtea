import {
  type Accessor,
  createContext,
  createSignal,
  For,
  onCleanup,
  type ParentProps,
  useContext,
} from "solid-js";

export type ToastKind = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  durationMs?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  items: Accessor<ToastItem[]>;
  notify: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>();

export function ToastProvider(props: ParentProps) {
  const [items, setItems] = createSignal<ToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 0;

  const dismiss = (id: number) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const notify = (message: string, options: ToastOptions = {}) => {
    const id = ++nextId;
    const item = { id, message, ...options };
    setItems((current) => {
      const next = [...current, item];
      for (const removed of next.slice(0, -4)) {
        const timer = timers.get(removed.id);
        if (timer) clearTimeout(timer);
        timers.delete(removed.id);
      }
      return next.slice(-4);
    });
    const duration = options.durationMs ?? (options.kind === "error" ? 0 : 4_000);
    if (duration > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    return id;
  };

  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  return (
    <ToastContext.Provider value={{ items, notify, dismiss }}>
      {props.children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

export function ToastViewport() {
  const { items, dismiss } = useToast();
  return (
    <section class="toast-viewport" aria-label="Notifications">
      <For each={items()}>
        {(item) => (
          <section
            class="toast"
            classList={{
              [`toast-${item.kind ?? "info"}`]: true,
            }}
            role={item.kind === "error" ? "alert" : "status"}
            aria-live={item.kind === "error" ? "assertive" : "polite"}
          >
            <span class="toast-mark" aria-hidden="true">
              {item.kind === "error" ? "!" : "✳"}
            </span>
            <p>{item.message}</p>
            {item.action && (
              <button
                class="toast-action"
                type="button"
                onClick={() => {
                  item.action?.run();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              class="toast-dismiss"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </section>
        )}
      </For>
    </section>
  );
}
