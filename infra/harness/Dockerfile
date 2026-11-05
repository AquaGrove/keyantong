# DeepSeek Harness (developer preview) — least privilege + loopback + proxy
# See docs/22-llm-gateway-and-harness.md and upstream SAFETY.md
FROM node:24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 10001 dsh \
  && useradd -m -u 10001 -g 10001 -s /bin/bash dsh

WORKDIR /opt/dsh
ENV npm_config_update_notifier=false
# Pin a published CLI; bump intentionally after reading release notes.
RUN npm install -g @deepseek-ai/dsh@0.2.1-rc.5 @deepseek-ai/dsh-sdk-client@0.2.1-rc.5 \
  && npm cache clean --force

COPY worker-bridge.mjs worker-profile.patch.yml /opt/dsh/
COPY proxy.mjs /opt/dsh/proxy.mjs
COPY entrypoint.sh /opt/dsh/entrypoint.sh
RUN chmod +x /opt/dsh/entrypoint.sh \
  && mkdir -p /data/harness \
  && chown -R dsh:dsh /data/harness /opt/dsh /home/dsh

ENV DSH_HOME=/data/harness
ENV HOME=/home/dsh
ENV DSH_PORT=3079
ENV PROXY_PORT=3080
ENV DSH_LLM_API_KEY=""
ENV DSH_LLM_BASE_URL=""

USER dsh
EXPOSE 3080
VOLUME ["/data/harness"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=8 \
  CMD curl -fsS http://127.0.0.1:3080/ >/dev/null || exit 1

ENTRYPOINT ["/opt/dsh/entrypoint.sh"]
