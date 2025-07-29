'use client';

import React, { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tab,
  Tabs,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Satellite,
  Twitter,
  AccountBalance,
  Phone
} from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`alternative-data-tabpanel-${index}`}
      aria-labelledby={`alternative-data-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Simple placeholder components for now
const SatelliteAnalysisTab: React.FC = () => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Satellite Analysis</Typography>
        <Typography>Loading satellite data...</Typography>
      </CardContent>
    </Card>
  );
};

const SocialSentimentTab: React.FC = () => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Social Sentiment</Typography>
        <Typography>Loading social sentiment data...</Typography>
      </CardContent>
    </Card>
  );
};

const EconomicIndicatorsTab: React.FC = () => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Economic Indicators</Typography>
        <Typography>Loading economic data...</Typography>
      </CardContent>
    </Card>
  );
};

const EarningsSentimentTab: React.FC = () => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Earnings Sentiment</Typography>
        <Typography>Loading earnings data...</Typography>
      </CardContent>
    </Card>
  );
};

// Main Alternative Data Dashboard Component
const AlternativeDataDashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Alternative Data Intelligence
      </Typography>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="alternative data tabs">
          <Tab 
            label="Satellite Analysis" 
            icon={<Satellite />} 
            iconPosition="start"
            id="alternative-data-tab-0"
            aria-controls="alternative-data-tabpanel-0"
          />
          <Tab 
            label="Social Sentiment" 
            icon={<Twitter />} 
            iconPosition="start"
            id="alternative-data-tab-1"
            aria-controls="alternative-data-tabpanel-1"
          />
          <Tab 
            label="Economic Indicators" 
            icon={<AccountBalance />} 
            iconPosition="start"
            id="alternative-data-tab-2"
            aria-controls="alternative-data-tabpanel-2"
          />
          <Tab 
            label="Earnings Sentiment" 
            icon={<Phone />} 
            iconPosition="start"
            id="alternative-data-tab-3"
            aria-controls="alternative-data-tabpanel-3"
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <SatelliteAnalysisTab />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <SocialSentimentTab />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <EconomicIndicatorsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <EarningsSentimentTab />
      </TabPanel>
    </Box>
  );
};

export default AlternativeDataDashboard;