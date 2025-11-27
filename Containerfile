# Vintage NPM Registry
# Verdaccio with time-machine filtering plugin

FROM verdaccio/verdaccio:5

# Switch to root for installation
USER root

# Create plugins directory
RUN mkdir -p /verdaccio/plugins

# Copy and build the plugin
COPY plugin /opt/verdaccio-plugin-vintage
WORKDIR /opt/verdaccio-plugin-vintage

# Install dependencies and build
RUN npm install && npm run build

# Fix permissions so verdaccio user can read plugin
RUN chmod -R a+rX /opt/verdaccio-plugin-vintage

# Link plugin to Verdaccio plugins directory
# Name must match config key: filters.vintage -> verdaccio-vintage
RUN ln -s /opt/verdaccio-plugin-vintage /verdaccio/plugins/verdaccio-vintage

# Copy configuration
COPY conf/config.yaml /verdaccio/conf/config.yaml
COPY conf/denylist.txt /verdaccio/conf/denylist.txt

# Ensure correct ownership (use numeric UID from base image)
RUN chown -R 10001:0 /verdaccio

# Switch back to verdaccio user
USER 10001

WORKDIR /verdaccio

EXPOSE 4873

CMD ["verdaccio", "--config", "/verdaccio/conf/config.yaml"]
