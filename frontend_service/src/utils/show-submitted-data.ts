export const showSubmittedData = (data: unknown) => {
  // eslint-disable-next-line no-console
  console.log('Submitted data:', JSON.stringify(data, null, 2));
  alert(`Submitted data:\n${JSON.stringify(data, null, 2)}`);
};
