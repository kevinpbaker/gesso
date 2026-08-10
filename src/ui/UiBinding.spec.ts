import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirtyFlags } from './DirtyFlags';
import { UiBinding } from './UiBinding';

describe('UiBinding', () => {
  let graph: {
    updateProperty: ReturnType<typeof vi.fn>;
    handleBindingError: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    graph = {
      updateProperty: vi.fn(),
      handleBindingError: vi.fn()
    };
  });

  describe('construction', () => {
    it('stores its id', () => {
      const observable = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', observable, graph as any, DirtyFlags.Content);
      expect(binding.id).toBe(1);
    });

    it('stores its node id', () => {
      const observable = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', observable, graph as any, DirtyFlags.Content);
      expect(binding.nodeId).toBe('node');
    });

    it('stores its property', () => {
      const observable = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', observable, graph as any, DirtyFlags.Content);
      expect(binding.property).toBe('text');
    });

    it('starts disconnected', () => {
      const observable = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', observable, graph as any, DirtyFlags.Content);
      expect(binding.connected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('subscribes to the observable', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      expect(binding.connected()).toBe(true);
    });

    it('throws when connected twice', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      expect(() => binding.connect()).toThrow('Binding 1 is already connected.');
    });

    it('stores the emitted value', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      subject.next('Hello');
      expect(binding.value()).toBe('Hello');
    });

    it('updates the graph when a value is emitted', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      subject.next('Hello');
      expect(graph.updateProperty).toHaveBeenCalledWith('node', 'text', 'Hello', DirtyFlags.Content);
    });

    it('passes through multiple values', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      subject.next('A');
      subject.next('B');
      subject.next('C');
      expect(graph.updateProperty).toHaveBeenCalledTimes(3);
    });

    it('works with a BehaviorSubject', () => {
      const subject = new BehaviorSubject('Initial');
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      expect(graph.updateProperty).toHaveBeenCalledWith('node', 'text', 'Initial', DirtyFlags.Content);
    });
  });

  describe('disconnect', () => {
    it('marks the binding disconnected', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      binding.disconnect();
      expect(binding.connected()).toBe(false);
    });

    it('stops receiving values', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      binding.disconnect();
      subject.next('Hello');
      expect(graph.updateProperty).not.toHaveBeenCalled();
    });

    it('can be disconnected more than once', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      expect(() => binding.disconnect()).not.toThrow();
      expect(() => binding.disconnect()).not.toThrow();
    });

    it('can be reconnected after disconnecting', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      binding.disconnect();
      binding.connect();
      subject.next('Hello');
      expect(graph.updateProperty).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('forwards observable errors to the graph', () => {
      const subject = new Subject<string>();
      const error = new Error('Something went wrong');
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      subject.error(error);
      expect(graph.handleBindingError).toHaveBeenCalledWith(binding, error);
    });

    it('becomes disconnected after an error', () => {
      const subject = new Subject<string>();
      const binding = new UiBinding(1, 'node', 'text', subject, graph as any, DirtyFlags.Content);
      binding.connect();
      subject.error(new Error('boom'));
      expect(binding.connected()).toBe(false);
    });
  });
});
