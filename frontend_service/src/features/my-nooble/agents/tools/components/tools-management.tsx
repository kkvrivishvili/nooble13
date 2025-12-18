import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  IconTool,
  IconApi,
  IconDatabase,
  IconMail,
  IconCalendar,
  IconBrandSlack,
  IconBrandGoogle,
  IconWebhook,
  IconSettings
} from '@tabler/icons-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'api' | 'integration' | 'utility';
  icon: React.ReactNode;
  enabled: boolean;
  configured: boolean;
  requiredConfig?: string[];
}

const mockTools: Tool[] = [
  {
    id: '1',
    name: 'Web Search',
    description: 'Search the web for information',
    category: 'api',
    icon: <IconApi size={20} />,
    enabled: true,
    configured: true,
    requiredConfig: ['API_KEY']
  },
  {
    id: '2',
    name: 'Database Query',
    description: 'Query your internal databases',
    category: 'utility',
    icon: <IconDatabase size={20} />,
    enabled: false,
    configured: false,
    requiredConfig: ['DB_CONNECTION']
  },
  {
    id: '3',
    name: 'Send Email',
    description: 'Send emails on behalf of the user',
    category: 'integration',
    icon: <IconMail size={20} />,
    enabled: true,
    configured: true,
    requiredConfig: ['SMTP_CONFIG']
  },
  {
    id: '4',
    name: 'Calendar',
    description: 'Access and manage calendar events',
    category: 'integration',
    icon: <IconCalendar size={20} />,
    enabled: false,
    configured: false,
    requiredConfig: ['GOOGLE_CALENDAR_API']
  },
  {
    id: '5',
    name: 'Slack',
    description: 'Send messages to Slack channels',
    category: 'integration',
    icon: <IconBrandSlack size={20} />,
    enabled: true,
    configured: false,
    requiredConfig: ['SLACK_TOKEN', 'SLACK_CHANNEL']
  },
  {
    id: '6',
    name: 'Google Drive',
    description: 'Access and manage Google Drive files',
    category: 'integration',
    icon: <IconBrandGoogle size={20} />,
    enabled: false,
    configured: false,
    requiredConfig: ['GOOGLE_DRIVE_API']
  },
  {
    id: '7',
    name: 'Webhooks',
    description: 'Call custom webhooks',
    category: 'api',
    icon: <IconWebhook size={20} />,
    enabled: true,
    configured: true,
    requiredConfig: ['WEBHOOK_URL']
  }
];

export function ToolsManagement() {
  const [tools, setTools] = useState<Tool[]>(mockTools);

  const handleToggleTool = (toolId: string) => {
    setTools(prev => prev.map(tool => 
      tool.id === toolId 
        ? { ...tool, enabled: !tool.enabled }
        : tool
    ));
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'api':
        return 'default';
      case 'integration':
        return 'secondary';
      case 'utility':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const enabledCount = tools.filter(t => t.enabled).length;
  const configuredCount = tools.filter(t => t.configured).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent Tools</h2>
          <p className="text-muted-foreground">
            Configure tools and integrations available to your agents
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tools.length}</div>
            <p className="text-xs text-muted-foreground">Available tools</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledCount}</div>
            <p className="text-xs text-muted-foreground">Active tools</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Configured</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configuredCount}</div>
            <p className="text-xs text-muted-foreground">Ready to use</p>
          </CardContent>
        </Card>
      </div>

      {/* Tools Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        {tool.icon}
                      </div>
                      <div>
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {tool.description}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getCategoryBadgeVariant(tool.category)}>
                      {tool.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tool.configured ? (
                      <Badge variant="outline" className="text-green-600">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
                        Not configured
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={tool.enabled}
                      onCheckedChange={() => handleToggleTool(tool.id)}
                      disabled={!tool.configured}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <IconSettings size={16} className="mr-1" />
                      Configure
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}