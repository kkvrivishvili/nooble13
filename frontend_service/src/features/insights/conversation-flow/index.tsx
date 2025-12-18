import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

// Sample data for analytics
const pieData = [
  { name: 'Desktop', value: 65, color: '#0088FE' },
  { name: 'Mobile', value: 25, color: '#00C49F' },
  { name: 'Tablet', value: 10, color: '#FFBB28' }
]

const barData = [
  { month: 'Jan', visitors: 4000, pageViews: 2400, bounceRate: 35 },
  { month: 'Feb', visitors: 3000, pageViews: 1398, bounceRate: 42 },
  { month: 'Mar', visitors: 2000, pageViews: 9800, bounceRate: 29 },
  { month: 'Apr', visitors: 2780, pageViews: 3908, bounceRate: 38 },
  { month: 'May', visitors: 1890, pageViews: 4800, bounceRate: 45 },
  { month: 'Jun', visitors: 2390, pageViews: 3800, bounceRate: 32 }
]

export default function DashboardAnalytics() {
  return (
    <>
      <div className='mb-2 flex items-center justify-between space-y-2'>
        <div className='flex items-center space-x-2'>
          <Badge variant="secondary">Last 30 days</Badge>
        </div>
        <div className='flex items-center space-x-2'>
          <Button variant="outline">Export Data</Button>
          <Button>Generate Report</Button>
        </div>
      </div>
      
      <div className='space-y-4'>
        {/* Key metrics */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Page Views
              </CardTitle>
              <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>24,567</div>
              <p className='text-muted-foreground text-xs'>
                +12.5% from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Unique Visitors
              </CardTitle>
              <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>8,234</div>
              <p className='text-muted-foreground text-xs'>
                +8.2% from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Bounce Rate
              </CardTitle>
              <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>32.4%</div>
              <p className='text-green-600 text-xs'>
                -2.1% improvement
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Avg. Session Duration
              </CardTitle>
              <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>3m 42s</div>
              <p className='text-muted-foreground text-xs'>
                +15s from last month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Traffic by Device</CardTitle>
              <CardDescription>
                Breakdown of visitors by device type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Analytics</CardTitle>
              <CardDescription>
                Visitors and page views over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="visitors" fill="#0088FE" name="Visitors" />
                  <Bar dataKey="pageViews" fill="#00C49F" name="Page Views" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Most visited pages table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>
              Most visited pages in the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { page: '/dashboard', views: 5420, percentage: 22.1 },
                { page: '/products', views: 3210, percentage: 13.1 },
                { page: '/about', views: 2890, percentage: 11.8 },
                { page: '/contact', views: 2156, percentage: 8.8 },
                { page: '/blog', views: 1987, percentage: 8.1 }
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{item.page}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.views.toLocaleString()} views
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{item.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}