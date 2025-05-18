import React, { forwardRef } from 'react';

const Divider = forwardRef((props: {}, ref: React.Ref<HTMLSpanElement>) => {
  return <span ref={ref} style={{ height: 28, width: 1, background: '#e5e7eb', margin: '0 16px', display: 'inline-block', borderRadius: 1 }} />;
});
Divider.displayName = 'Divider';

export default Divider; 