"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Tema = "light" | "dark";

/** Misma clave que usaba next-themes: conserva la elección ya guardada. */
const CLAVE_TEMA = "theme";

const ContextoTema = createContext<{
  tema: Tema;
  fijarTema: (tema: Tema) => void;
}>({ tema: "dark", fijarTema: () => {} });

export function useTema() {
  return useContext(ContextoTema);
}

/**
 * Proveedor claro/oscuro propio (sin next-themes). El script bloqueante del
 * layout raíz aplica la clase en <html> antes de pintar; aquí solo se
 * refleja ese estado y se expone fijarTema para cambiarlo.
 */
export function ProveedorTema({ children }: { children: React.ReactNode }) {
  // El tema real solo se conoce en cliente; los consumidores que pinten
  // según el tema deben esperar al montaje (como hace ToggleTema)
  const [tema, setTema] = useState<Tema>("dark");

  const fijarTema = useCallback((nuevo: Tema) => {
    setTema(nuevo);
    const raiz = document.documentElement;
    raiz.classList.remove("light", "dark");
    raiz.classList.add(nuevo);
    raiz.style.colorScheme = nuevo;
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(
      document.documentElement.classList.contains("light") ? "light" : "dark"
    );
    // Sincroniza el tema entre pestañas abiertas
    const alCambiarStorage = (e: StorageEvent) => {
      if (e.key === CLAVE_TEMA && (e.newValue === "light" || e.newValue === "dark")) {
        fijarTema(e.newValue);
      }
    };
    window.addEventListener("storage", alCambiarStorage);
    return () => window.removeEventListener("storage", alCambiarStorage);
  }, [fijarTema]);

  return (
    <ContextoTema.Provider value={{ tema, fijarTema }}>
      {children}
    </ContextoTema.Provider>
  );
}
