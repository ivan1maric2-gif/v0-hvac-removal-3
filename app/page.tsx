import { AppProvider } from "@/lib/app-state";
import { ProductProvider } from "@/lib/product-state";
import { WorkflowNavProvider } from "@/lib/workflow-nav";
import { AppShell } from "@/components/hvac/app-shell";

export default function Page() {
  return (
    <ProductProvider>
      <AppProvider>
        <WorkflowNavProvider>
          <AppShell />
        </WorkflowNavProvider>
      </AppProvider>
    </ProductProvider>
  );
}
