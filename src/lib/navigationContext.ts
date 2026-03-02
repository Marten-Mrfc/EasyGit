import { createContext, useContext } from "react";
import type { View } from "@/components/layout/Sidebar";

interface NavigationContextType {
  navigate: (view: View) => void;
}

export const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
