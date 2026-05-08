import { AppProvider } from "@/lib/app-state";
import { ProductProvider } from "@/lib/product-state";
import { AppShell } from "@/components/hvac/app-shell";

export default function Page() {
  return (
    <ProductProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ProductProvider>
  );
}
