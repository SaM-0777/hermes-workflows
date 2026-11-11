# Sales Data Analysis Pipeline

I want you to build and execute a moderately complex workflow using the Workflow Studio plugin.

Create a **Sales Data Analysis Pipeline** with the following requirements:

### 1. Generate Sales Data
Create a dataset containing approximately 20 sample sales records. Each record should include:
- Order ID
- Customer ID
- Product name
- Quantity
- Unit price
- Order date
- Region

Include a few intentionally invalid records for testing data validation.

### 2. Validate and Clean Data
Create a node that:
- Validates required fields.
- Rejects records with missing or invalid values.
- Calculates each order's total amount.
- Outputs the cleaned records and rejected record count.

### 3. Revenue Analysis
Create a node that receives the cleaned records and calculates:
- Total revenue
- Average order value
- Total number of orders
- Revenue by region
- Best-selling product
- Top revenue-generating product

### 4. Customer Analysis
Create another node that receives the same cleaned records and calculates:
- Total unique customers
- Repeat customers
- Average spending per customer
- Customer segmentation based on spending

### 5. Business Insights
Create a node that combines the revenue and customer analysis outputs.

Generate at least five meaningful business insights based on the data.

### 6. Final Report
Create a final node that combines the business insights and rejected record count into a structured report.

### Workflow requirements
- Build this as a connected graph in Workflow Studio.
- Use separate nodes for each processing stage.
- Connect nodes through their actual output and input handles.
- Revenue Analysis and Customer Analysis must be separate branches that can execute in parallel.
- Business Insights must receive outputs from both branches.
- Final Report must receive the business insights and rejected record count.
- Do not hardcode downstream results. Each node must calculate its results from its actual inputs.
- Use Python for node execution.
- Save the workflow before executing it.

### Execution and verification
After building the workflow:
1. Execute it using the Workflow Studio execution mechanism.
2. Verify that every node executes successfully.
3. Verify that data is passed correctly between connected nodes.
4. Inspect the final report.
5. If any node fails, inspect the error, fix the node, and execute again.

Do not merely describe or provide a plan. Actually construct the workflow in Workflow Studio and run it.

When finished, report the workflow ID, execution status, and final business report.

---

# Earthquake Impact Assessment

Build and execute a real-world Earthquake Impact Assessment workflow using live data from official USGS and NASA APIs.

Use the USGS Earthquake API to identify a recent significant earthquake, retrieve its event details, and collect available ShakeMap, PAGER, and DYFI products. In parallel, retrieve relevant pre-event and post-event satellite imagery from NASA GIBS, using its official imagery services. Analyze ground-shaking intensity, available impact estimates, geographic exposure, and satellite imagery. Combine the findings into a structured disaster assessment report containing the event details, affected areas, available impact estimates, imagery references, data sources, and recommended areas for further investigation.

**Strict requirements:**
- Use Workflow Studio's registered tools for creating nodes, configuring components, connecting ports, saving the workflow, and executing it. Do not merely describe the workflow or return a manually constructed graph.
- Use actual HTTP requests to public, free, official APIs. Verify endpoint documentation and response formats before implementing nodes.
- Use USGS and NASA sources specified above. Do not substitute mock data, fabricated API responses, hardcoded results, or unofficial scraped datasets.
- Build separate parallel branches for seismic impact assessment and satellite imagery retrieval, then combine their outputs into the final report.
- Use real API responses as node inputs and propagate data through connected output/input handles.
- Handle missing products, unavailable imagery, API errors, and empty responses explicitly. Never invent missing measurements or claim damage has been detected unless actual imagery analysis has been performed.
- Include source URLs, observation dates, timestamps, units, and data limitations in the final report.
- Use Python for node execution and keep each processing stage in a separate reusable component.
- Save the completed workflow and execute it. Verify that the nodes run successfully and that the final report is based on the actual retrieved data.

---

# Neutrino Oscillations & Lorentz Invariance: A Comparative KM3NeT and IceCube Analysis

Build a neutrino physics research workflow investigating Lorentz invariance using publicly available KM3NeT/ORCA and IceCube experimental datasets. Retrieve the ORCA6 public dataset and the latest available IceCube neutrino event release, analyze neutrino event distributions and oscillation-related measurements, and compare the experimental findings with predictions from standard neutrino physics and published Lorentz-invariance-violation constraints. Create parallel branches for KM3NeT and IceCube data analysis, combine their findings, and generate a scientific report with statistical comparisons, visualizations, methodology, source references, and limitations. Strictly use Workflow Studio tools to create, configure, connect, save, and execute the workflow. Use official research datasets and documented scientific methods; do not fabricate events, measurements, or experimental conclusions. Clearly distinguish an independent analysis of public data from reproducing the collaboration's full scientific analysis.

---
