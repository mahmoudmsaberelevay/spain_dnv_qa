import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QualificationsReports from "./QualificationsReports";
import ParalegalReportsPage from "./ParalegalReports";
import FinancialReports from "./FinancialReports";
import VisasReportsPage from "./VisasReportsPage";
import AttestationReportsPage from "./AttestationReportsPage";

export default function Reports() {
  const [activeTab, setActiveTab] = useState("qualifications");

  return (
    <div className="w-full h-full bg-background text-foreground p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-2">Manage and view daily reports across all departments</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
          <TabsTrigger value="paralegal">Paralegal</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="visas">Visas</TabsTrigger>
          <TabsTrigger value="attestation">Attestation</TabsTrigger>
        </TabsList>

        <TabsContent value="qualifications" className="mt-6">
          <QualificationsReports />
        </TabsContent>

        <TabsContent value="paralegal" className="mt-6">
          <ParalegalReportsPage />
        </TabsContent>

        <TabsContent value="financial" className="mt-6">
          <FinancialReports />
        </TabsContent>

        <TabsContent value="visas" className="mt-6">
          <VisasReportsPage />
        </TabsContent>

        <TabsContent value="attestation" className="mt-6">
          <AttestationReportsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
