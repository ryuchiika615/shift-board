export const csvData = `従業員名,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
店長,11-18,14-休,休,休,15-17,休,休,16-18,14-休,15-17,休,14-休,休,休,休
森,休,休,休,休,休,休,休,休,休,休,休,休,休,休,休
西村(優),9-L,休,休,休,9-L,12-L,9-L,9-L,休,9-L,休,休,12-16,9-L,9-L
西村(海),18-L,18-L,休,休,18-L,16-L,休,18-L,休,18-L,休,18-L,16-L,休,16-L
玉置,休,9-14,9-14,9-14,休,休,休,休,9-14,9-14,9-14,9-14,休,休,休
河原,休,休,休,休,休,休,11-15,休,休,休,休,休,休,休,休
杉田,9-14,9-14,休,休,9-14,休,休,9-14,9-14,休,休,9-14,休,休,9-14
熊澤,休,休,17-L,休,休,17-L,17-L,休,17-L,休,休,休,休,17-L,休
渡辺,10-L,休,11-L,休,11-L,11-L,11-L,11-16.75,休,11-L,11-L,休,11-16,11-L,11-L
安部,休,10-14,休,10-14,10-15,休,11-15,休,10-14,休,休,10-14,休,10-15,休
北川,休,休,10-14,休,休,10-14,10-14,10-14,休,10-14,休,休,10-14,10-14,10-14
本橋,10-15,休,10-15,休,10-15,休,休,10-15,休,10-14,休,10-14,休,休,10-15
早川,休,休,休,18-L,休,休,18-L,休,休,休,休,12-L,休,休,休
小林,休,休,休,休,休,休,休,休,休,休,休,18-L,休,休,休
関口,休,10-14,休,10-14,休,休,休,休,10-15,休,10-15,11-15,休,休,休
水本,休,休,休,休,休,休,10-14,休,休,休,10-14,休,10-14,休,休
蒔野,休,休,休,休,休,休,休,休,休,休,休,18-L,16-L,16-L,休
浅海,休,18-L,休,18-L,休,12-16,休,18-L,18-L,休,18-L,休,12-15,休,休
玉川,休,11-16.75,休,11-16.75,休,10-15.75,12-16,休,11-16.75,休,休,休,休,11-16,休`;

export const parseCSV = (csv) => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = { name: values[0] };
    for (let j = 1; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    data.push(row);
  }
  
  return { headers, data };
};

export const calculateHours = (shift) => {
  if (!shift || shift === '休') return 0;
  
  const isLast = shift.includes('L');
  const cleanShift = shift.replace('L', '');
  
  if (!cleanShift.includes('-')) return 0;
  
  const [startStr, endStr] = cleanShift.split('-');
  const start = parseFloat(startStr);
  
  let end;
  if (isLast) {
    end = 22;
  } else {
    end = parseFloat(endStr);
  }
  
  if (isNaN(start) || isNaN(end)) return 0;
  
  return end - start;
};

export const calculateDailyStats = (data, day) => {
  let totalHours = 0;
  let staffCount = 0;
  
  data.forEach(row => {
    const shift = row[day];
    if (shift && shift !== '休') {
      const hours = calculateHours(shift);
      totalHours += hours;
      staffCount++;
    }
  });
  
  return { totalHours, staffCount };
};

export const calculateMonthlyStats = (data, headers) => {
  let totalHours = 0;
  let totalDays = 0;
  
  headers.slice(1).forEach(day => {
    const { totalHours: dayHours } = calculateDailyStats(data, day);
    totalHours += dayHours;
    if (dayHours > 0) totalDays++;
  });
  
  return { totalHours, totalDays };
};

export const getShiftColor = (shift) => {
  if (!shift || shift === '休') return 'bg-gray-100 text-gray-400';
  if (shift.includes('L')) return 'bg-green-100 text-green-800';
  if (shift.includes('-')) return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-600';
};
