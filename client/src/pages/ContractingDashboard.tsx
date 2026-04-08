import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Receipt, TrendingUp, Users, Plus, ArrowRight, Clock, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import NewContractDialog from "@/components/NewContractDialog";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [showNewContract, setShowNewContract] = useState(false);

  const { data: stats, isLoading: statsLoading } = trpc.contracting.analytics.stats.useQuery();
  const { data: recentContracts, isLoading: contractsLoading } = trpc.contracting.analytics.recentContracts.useQuery({ limit: 5 });
  const { data: rateInfo } = trpc.contracting.exchangeRate.current.useQuery();
  const { data: consultantStats } = trpc.contracting.analytics.consultantStats.useQuery();

  const statCards = [
    {
      title: "Total Contracts",
      value: stats?.total ?? 0,
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Signed Contracts",
      value: stats?.signed ?? 0,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Total Collected",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: Receipt,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome to ELEVAY Contract Management System
          </p>
        </div>
        <Button
          onClick={() => setShowNewContract(true)}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
          size="lg"
        >
          <Plus className="h-4 w-4" />
          Issue New Contract
        </Button>
      </div>

      {/* Exchange Rate Banner */}
      {rateInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-amber-800">
            <strong>Live Rate:</strong> 1 EUR = {rateInfo.rate.toFixed(4)} EGP
            <span className="text-amber-600 ml-2">· Source: {rateInfo.source}</span>
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {statsLoading ? "—" : card.value}
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Overview */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-sm text-muted-foreground mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.signed}</p>
              <p className="text-sm text-muted-foreground mt-1">Signed</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">{stats.cancelled}</p>
              <p className="text-sm text-muted-foreground mt-1">Cancelled</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Contracts */}
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Recent Contracts</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/contracting/contracts")}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {contractsLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !recentContracts?.length ? (
            <div className="p-6 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No contracts yet. Issue your first contract!</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentContracts.map((contract) => (
                <div key={contract.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{contract.clientName}</p>
                      <p className="text-xs text-muted-foreground">{contract.contractCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(Number(contract.contractValue), "EUR")}</span>
                    <Badge className={`text-xs ${getStatusBadgeClass(contract.status)}`}>
                      {contract.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consultant Performance */}
      {consultantStats && consultantStats.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Consultant Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {consultantStats.map((c) => (
                <div key={c.name} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCheck className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Signed</p>
                      <p className="text-sm font-bold text-green-600">{c.count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(c.value, "EUR")}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <NewContractDialog open={showNewContract} onClose={() => setShowNewContract(false)} />
    </div>
  );
}
