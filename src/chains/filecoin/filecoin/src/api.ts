//#region Imports
import { types, Quantity, PromiEvent, Subscription } from "@ganache/utils";
import Blockchain from "./blockchain";
import {
  StorageProposal,
  SerializedStorageProposal
} from "./things/storage-proposal";
import { SerializedRootCID, RootCID } from "./things/root-cid";
import { SerializedDeal } from "./things/deal";
import { SerializedTipset, Tipset } from "./things/tipset";
import { SerializedAddress } from "./things/address";
import { SerializedMiner } from "./things/miner";
import {
  SerializedRetrievalOffer,
  RetrievalOffer
} from "./things/retrieval-offer";
import Emittery from "emittery";
import { HeadChange, HeadChangeType } from "./things/head-change";
import { SubscriptionMethod, SubscriptionId } from "./types/subscriptions";

export default class FilecoinApi implements types.Api {
  readonly [index: string]: (...args: any) => Promise<any>;

  readonly #getId = (id => () => Quantity.from(++id))(0);
  readonly #subscriptions = new Map<string, Emittery.UnsubscribeFn>();
  readonly #blockchain: Blockchain;

  constructor(blockchain: Blockchain) {
    this.#blockchain = blockchain;
  }

  async stop(): Promise<void> {
    return await this.#blockchain.stop();
  }

  async "Filecoin.ChainGetGenesis"(): Promise<SerializedTipset> {
    return this.#blockchain.latestTipset().serialize();
  }

  async "Filecoin.ChainHead"(): Promise<SerializedTipset> {
    return this.#blockchain.latestTipset().serialize();
  }

  // Reference implementation entry point: https://git.io/JtO3a
  "Filecoin.ChainNotify"(rpcId?: string): PromiEvent<Subscription> {
    const subscriptionId = this.#getId();
    let promiEvent: PromiEvent<Subscription>;

    const currentHead = new HeadChange({
      type: HeadChangeType.HCCurrent,
      val: this.#blockchain.latestTipset()
    });

    const unsubscribeFromEmittery = this.#blockchain.on(
      "tipset",
      (tipset: Tipset) => {
        // Ganache currently doesn't support Filecoin reorgs,
        // so we'll always only have one tipset per head change
        // See reference implementations here: https://git.io/JtOOk;
        // other lines of interest are line 207 which shows only the chainstore only
        // references the "hcnf" (head change notification function) in the
        // reorgWorker function (lines 485-560)

        // Ganache currently doesn't support Filecoin reverts,
        // so we'll always use HCApply for now

        const newHead = new HeadChange({
          type: HeadChangeType.HCApply,
          val: tipset
        });

        if (promiEvent) {
          promiEvent.emit("message", {
            type: SubscriptionMethod.ChannelUpdated,
            data: [subscriptionId.toString(), [newHead.serialize()]]
          });
        }
      }
    );

    const unsubscribe = (): void => {
      unsubscribeFromEmittery();
      // Per https://git.io/JtOc1 and https://git.io/JtO3H
      // implementations, we're should cancel the subscription
      // since the protocol technically supports multiple channels
      // per subscription, but implementation seems to show that there's
      // only one channel per subscription
      if (rpcId) {
        promiEvent.emit("message", {
          type: SubscriptionMethod.SubscriptionCanceled,
          data: [rpcId]
        });
      }
    };

    promiEvent = PromiEvent.resolve({
      unsubscribe,
      id: subscriptionId
    });

    // There currently isn't an unsubscribe method,
    // but it would go here
    this.#subscriptions.set(subscriptionId.toString(), unsubscribe);

    promiEvent.emit("message", {
      type: SubscriptionMethod.ChannelUpdated,
      data: [subscriptionId.toString(), [currentHead.serialize()]]
    });

    return promiEvent;
  }

  [SubscriptionMethod.ChannelClosed](
    subscriptionId: SubscriptionId
  ): Promise<boolean> {
    const subscriptions = this.#subscriptions;
    const unsubscribe = this.#subscriptions.get(subscriptionId);

    if (unsubscribe) {
      subscriptions.delete(subscriptionId);
      unsubscribe();
      return Promise.resolve(true);
    } else {
      return Promise.resolve(false);
    }
  }

  async "Filecoin.StateListMiners"(): Promise<Array<SerializedMiner>> {
    return [this.#blockchain.miner.serialize()];
  }

  async "Filecoin.WalletDefaultAddress"(): Promise<SerializedAddress> {
    return this.#blockchain.address.serialize();
  }

  async "Filecoin.WalletBalance"(address: string): Promise<string> {
    let managedAddress = this.#blockchain.address;

    // For now, anything but our default address will have no balance
    if (managedAddress.value == address) {
      return this.#blockchain.balance.serialize();
    } else {
      return "0";
    }
  }

  async "Filecoin.ClientStartDeal"(
    serializedProposal: SerializedStorageProposal
  ): Promise<SerializedRootCID> {
    let proposal = new StorageProposal(serializedProposal);
    let proposalRootCid = await this.#blockchain.startDeal(proposal);

    return proposalRootCid.serialize();
  }

  async "Filecoin.ClientListDeals"(): Promise<Array<SerializedDeal>> {
    return this.#blockchain.deals.map(deal => deal.serialize());
  }

  async "Filecoin.ClientFindData"(
    rootCid: SerializedRootCID
  ): Promise<Array<SerializedRetrievalOffer>> {
    let remoteOffer = await this.#blockchain.createRetrievalOffer(
      new RootCID(rootCid)
    );
    return [remoteOffer.serialize()];
  }

  async "Filecoin.ClientHasLocal"(
    rootCid: SerializedRootCID
  ): Promise<boolean> {
    return await this.#blockchain.hasLocal(rootCid["/"]);
  }

  async "Filecoin.ClientRetrieve"(
    retrievalOffer: SerializedRetrievalOffer
  ): Promise<object> {
    await this.#blockchain.retrieve(new RetrievalOffer(retrievalOffer));

    // Return value is a placeholder.
    //
    // 1) JSON wants to parse the result, so this prevents it parsing `undefined`.
    // 2) This API is going to change very soon, according to Lotus devs.
    //
    // As of this writing, this API function is *supposed* to return nothing at all.
    return {};
  }

  async "Ganache.MineTipset"(): Promise<SerializedTipset> {
    await this.#blockchain.mineTipset();
    return this.#blockchain.latestTipset().serialize();
  }
}
