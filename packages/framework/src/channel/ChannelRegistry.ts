import { ChannelReplica } from './ChannelReplica';
import type { ChannelPort } from './ChannelProtocol';
import type { ChannelToken, CommandMap } from './ChannelToken';

/**
 * The channels a runtime can hand to its components, by name.
 *
 * A replica is the only thing kept: whether the data lives in another
 * worker or on this very thread is settled by the port it was attached
 * with, and nothing above here can tell.
 */
export class ChannelRegistry {
  private readonly replicas = new Map<string, ChannelReplica<object, CommandMap>>();

  /** Attaches a channel over `port`. */
  attach<View extends object, Commands extends object>(
    token: ChannelToken<View, Commands>,
    port: ChannelPort
  ): ChannelReplica<View, Commands> {
    if (this.replicas.has(token.name)) {
      throw new Error(`Channel '${token.name}' is already attached.`);
    }
    const replica = new ChannelReplica(token, port);
    this.replicas.set(token.name, replica as unknown as ChannelReplica<object, CommandMap>);
    return replica;
  }

  get<View extends object, Commands extends object>(
    token: ChannelToken<View, Commands>
  ): ChannelReplica<View, Commands> {
    const replica = this.replicas.get(token.name);
    if (replica === undefined) {
      const names = [...this.replicas.keys()].sort().join(', ');
      throw new Error(
        `Channel '${token.name}' is not attached. Did you forget useChannel(...)? ` +
          `Attached channels: ${names.length > 0 ? names : '(none)'}.`
      );
    }
    return replica as unknown as ChannelReplica<View, Commands>;
  }

  has(token: ChannelToken<object, CommandMap>): boolean {
    return this.replicas.has(token.name);
  }

  /** Every attached replica, for frame-aligned patch flushing. */
  all(): ChannelReplica<object, CommandMap>[] {
    return [...this.replicas.values()];
  }

  dispose(): void {
    for (const replica of this.replicas.values()) {
      replica.dispose();
    }
    this.replicas.clear();
  }
}
