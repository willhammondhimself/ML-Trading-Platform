'use client';

import React from 'react';
import { Grid } from '@mui/material';

const TestComponent: React.FC = () => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <div>Test</div>
      </Grid>
    </Grid>
  );
};

export default TestComponent;